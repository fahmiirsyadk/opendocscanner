module Component.App where

import Prelude

import Effect.Console (log)
import Halogen as H
import Halogen.Query (HalogenM)
import Halogen.HTML as HH
import Halogen.HTML.Properties as HP
import Halogen.HTML.Events as HE
import Web.UIEvent.MouseEvent as ME
import Web.Event.Event (Event, target)
import Web.HTML.HTMLInputElement as Input
import Web.File.File (name, type_, toBlob)
import Web.File.FileList (FileList, item, length)
import Data.Maybe (Maybe(..), maybe, fromMaybe)
import Data.Array as Array
import DOM.HTML.Indexed.InputAcceptType as Accept
import Data.MediaType (MediaType(..))
import Data.String as Str
import Web.File.Url as Url
import Effect.Aff.Class (class MonadAff)
import Data.Foldable (for_)
import Halogen.Query.HalogenM as HQ
import Data.Tuple (Tuple(..))
import FFI.Worker as W
import Halogen.Subscription as HS
import FFI.CanvasDraw (drawImageToCanvas)
import FFI.EditOverlay as EO
import FFI.PDFExport as PDF
import Routing.Duplex (RouteDuplex', root)
import Routing.Duplex as RD
import Routing.Duplex.Generic as RG
import Data.Generic.Rep (class Generic)
import Routing.Hash as Hash
import Data.Either (Either(..))
import Data.Number (sqrt)

type UploadItem =
  { name :: String
  , url :: String
  , mime :: Maybe MediaType
  , progress :: Number
  }

type State =
  { uploads :: Array UploadItem
  , isProcessing :: Boolean
  , resultCount :: Int
  , pending :: Int
  , sources :: Array UploadItem
  , editing :: Maybe Editing
  , route :: Route
  }

type Point = { x :: Number, y :: Number }

type Editing =
  { index :: Int
  , url :: String
  , points :: Array Point
  , dragging :: Maybe Int
  , width :: Int
  , height :: Int
  }

data Action
  = FilesChanged Event
  | ScanClicked
  | RemoveAt Int
  | ProcessNow
  | WorkerProgress Int Number
  | WorkerDone Int String
  | WorkerError Int String
  | Navigate Route
  | Initialize
  | OpenEditor Int
  | EditDetected Int (Array Point) Int Int
  | EditCancel
  | EditProcess
  | EditPointerDown ME.MouseEvent
  | EditPointerMove ME.MouseEvent
  | EditPointerUp ME.MouseEvent
  | ExportPDF

data Route = Home | Chat | Tools | About

derive instance genericRoute :: Generic Route _

routeCodec :: RouteDuplex' Route
routeCodec = root $ RG.sum
  { "Home": RG.noArgs
  , "Chat": RD.path "chat" RG.noArgs
  , "Tools": RD.path "tools" RG.noArgs
  , "About": RD.path "about" RG.noArgs
  }

component :: forall q i o m. MonadAff m => H.Component q i o m
component =
  H.mkComponent
    { initialState: \_ -> { uploads: [], isProcessing: false, resultCount: 0, pending: 0, sources: [], editing: Nothing, route: Home }
    , render
    , eval: H.mkEval $ H.defaultEval { handleAction = handleAction, initialize = Just Initialize }
    }
  where
  handleAction :: Action -> HalogenM State Action () o m Unit
  handleAction = case _ of
    Initialize -> do
      io <- H.liftEffect HS.create
      _ <- H.subscribe io.emitter
      _ <- H.liftEffect $ Hash.matchesWith (RD.parse routeCodec) \_ new -> HS.notify io.listener (Navigate new)
      -- set initial route from current hash
      cur <- H.liftEffect Hash.getHash
      case RD.parse routeCodec cur of
        Right r -> H.modify_ \s -> s { route = r }
        _ -> pure unit
      pure unit
    FilesChanged ev -> handleFilesChanged ev
    ScanClicked -> do
      H.liftEffect $ log "Scan with Camera button clicked"
      pure unit
    RemoveAt ix -> do
      H.modify_ \st -> st { uploads = fromMaybe st.uploads (Array.deleteAt ix st.uploads) }
      pure unit
    ProcessNow -> do
      st <- H.get
      let count = Array.length st.uploads
      H.modify_ \s -> s { isProcessing = true, resultCount = count, pending = count, sources = s.uploads, uploads = [] }
      -- spawn a worker per item and stream progress
      for_ (Array.mapWithIndex Tuple st.uploads) \(Tuple ix item) -> do
        _ <- HQ.fork do
          worker <- H.liftEffect $ W.spawn "./src/Worker/processor.worker.js"
          io <- H.liftEffect HS.create
          -- bridge worker -> actions
          H.liftEffect $ W.onMessage worker \msg -> do
            case msg of
              { tag: "progress", id, progress } -> HS.notify io.listener (WorkerProgress id progress)
              { tag: "done", id, url } -> HS.notify io.listener (WorkerDone id url)
              { tag: "doneBlob", id, blob } -> do
                -- Create an object URL from Blob and treat it as done
                url <- Url.createObjectURL blob
                HS.notify io.listener (WorkerDone id url)
              { tag: "error", id, reason } -> HS.notify io.listener (WorkerError id reason)
              _ -> pure unit
          -- subscribe emitter to evaluate actions in Halogen
          _ <- H.subscribe io.emitter
          H.liftEffect $ W.post worker { id: ix, url: item.url, name: item.name, op: "warp_auto" }
          pure unit
        pure unit
    WorkerProgress _ _ -> pure unit
    WorkerDone index url -> do
      -- draw into corresponding canvas (by order/index)
      let selector = "#result-canvas-" <> show (index + 1)
      H.liftEffect $ drawImageToCanvas selector url
      H.modify_ \s ->
        let newPending = if s.pending > 0 then s.pending - 1 else 0
        in s { pending = newPending, isProcessing = newPending /= 0 }
      pure unit
    WorkerError _ _ -> pure unit
    Navigate r -> H.modify_ \s -> s { route = r }
    OpenEditor ix -> do
      st <- H.get
      case Array.index st.sources ix of
        Nothing -> pure unit
        Just srcItem -> do
          -- open modal and request detection
          H.modify_ \s -> s { editing = Just { index: ix, url: srcItem.url, points: [], dragging: Nothing, width: 0, height: 0 } }
          -- ask worker to detect points
          _ <- HQ.fork do
            worker <- H.liftEffect $ W.spawn "./src/Worker/processor.worker.js"
            io <- H.liftEffect HS.create
            H.liftEffect $ W.onMessage worker \msg -> do
              case msg of
                { tag: "detected", id, points, width, height } -> HS.notify io.listener (EditDetected id points width height)
                _ -> pure unit
            _ <- H.subscribe io.emitter
            H.liftEffect $ W.post worker { id: ix, url: srcItem.url, name: srcItem.name, op: "detect_corners" }
            pure unit
          pure unit
    EditDetected idx pts w h -> do
      st <- H.get
      case st.editing of
        Nothing -> pure unit
        Just ed | ed.index /= idx -> pure unit
        Just ed -> do
          -- update editing data and draw base + overlay
          H.modify_ \s -> s { editing = Just ed { width = w, height = h, points = pts } }
          let baseSel = "#editor-base-canvas"
          let overlaySel = "#editor-overlay-canvas"
          H.liftEffect $ drawImageToCanvas baseSel ed.url
          H.liftEffect $ EO.resizeCanvas overlaySel w h
          H.liftEffect $ EO.drawOverlay overlaySel pts
          pure unit
    EditCancel -> H.modify_ \s -> s { editing = Nothing }
    EditProcess -> do
      st <- H.get
      case st.editing of
        Nothing -> pure unit
        Just ed -> do
          -- send precise warp with current points
          _ <- HQ.fork do
            worker <- H.liftEffect $ W.spawn "./src/Worker/processor.worker.js"
            io <- H.liftEffect HS.create
            H.liftEffect $ W.onMessage worker \msg -> do
              case msg of
                { tag: "done", id, url } -> HS.notify io.listener (WorkerDone id url)
                { tag: "doneBlob", id, blob } -> do
                  u <- Url.createObjectURL blob
                  HS.notify io.listener (WorkerDone id u)
                { tag: "error", id, reason } -> HS.notify io.listener (WorkerError id reason)
                _ -> pure unit
            _ <- H.subscribe io.emitter
            H.liftEffect $ W.post worker { id: ed.index, url: ed.url, op: "warp", points: ed.points }
            pure unit
          -- close modal
          H.modify_ \s -> s { editing = Nothing }
          pure unit
    EditPointerDown ev -> do
      st <- H.get
      case st.editing of
        Nothing -> pure unit
        Just ed -> do
          pos <- H.liftEffect $ EO.offsetXY (ME.toEvent ev)
          let idx = nearestIndex ed.points pos
          H.modify_ \s -> s { editing = Just ed { dragging = idx } }
          pure unit
    EditPointerMove ev -> do
      st <- H.get
      case st.editing of
        Nothing -> pure unit
        Just ed -> case ed.dragging of
          Nothing -> pure unit
          Just di -> do
            pos <- H.liftEffect $ EO.offsetXY (ME.toEvent ev)
            let newPts = fromMaybe ed.points (Array.updateAt di pos ed.points)
            H.modify_ \s -> s { editing = Just ed { points = newPts } }
            H.liftEffect $ EO.drawOverlay "#editor-overlay-canvas" newPts
            pure unit
    EditPointerUp _ -> do
      st <- H.get
      case st.editing of
        Nothing -> pure unit
        Just ed -> H.modify_ \s -> s { editing = Just ed { dragging = Nothing } }
    ExportPDF -> do
      st <- H.get
      let pages = map (\i -> { canvasSelector: "#result-canvas-" <> show i }) (Array.range 1 st.resultCount)
      H.liftEffect $ PDF.exportPdf pages
      pure unit

  handleFilesChanged :: Event -> HalogenM State Action () o m Unit
  handleFilesChanged ev = do
    case target ev >>= Input.fromEventTarget of
      Nothing -> pure unit
      Just inputEl -> do
        mFiles <- H.liftEffect $ Input.files inputEl
        case mFiles of
          Nothing -> pure unit
          Just fl -> processFileList fl

  processFileList :: FileList -> HalogenM State Action () o m Unit
  processFileList fl = do
    let n = length fl
    let loop i = if i < n then do
          case item i fl of
            Nothing -> loop (i + 1)
            Just f -> do
              url <- H.liftEffect $ Url.createObjectURL (toBlob f)
              let entry = { name: name f, url, mime: type_ f, progress: 0.0 }
              H.modify_ \st -> st { uploads = st.uploads <> [ entry ] }
              loop (i + 1)
        else pure unit
    loop 0

  render :: State -> H.ComponentHTML Action () m
  render state =
    HH.div [ HP.class_ (HH.ClassName "surface") ]
      [ navbar
      , renderRoute state
      , renderEditorModal state.editing
      ]

  renderRoute :: forall m1. State -> H.ComponentHTML Action () m1
  renderRoute st = case st.route of
    Home -> renderHome st
    Chat -> HH.div [ HP.class_ (HH.ClassName "center") ]
              [ HH.div [ HP.class_ (HH.ClassName "card") ]
                  [ HH.h2_ [ HH.text "Chat" ]
                  , HH.p_ [ HH.text "Alpha — coming soon" ]
                  ]
              ]
    Tools -> HH.div [ HP.class_ (HH.ClassName "center") ]
              [ HH.div [ HP.class_ (HH.ClassName "card") ]
                  [ HH.h2_ [ HH.text "Tools" ]
                  , HH.p_ [ HH.text "Coming soon" ]
                  ]
              ]
    About -> HH.div [ HP.class_ (HH.ClassName "center") ]
              [ HH.div [ HP.class_ (HH.ClassName "card") ]
                  [ HH.h2_ [ HH.text "About" ]
                  , HH.p_ [ HH.text "OpenDocScanner — document scanning & image manipulation." ]
                  ]
              ]

  renderHome :: forall m1. State -> H.ComponentHTML Action () m1
  renderHome state =
    HH.div_ 
      [ HH.div [ HP.class_ (HH.ClassName "center") ]
          [ HH.div [ HP.class_ (HH.ClassName "card") ]
              [ HH.h2 [ HP.class_ (HH.ClassName "card-title") ]
                  [ HH.text "What do you want to do?" ]
              , HH.p [ HP.class_ (HH.ClassName "card-subtitle") ]
                  [ HH.text "Choose one option to get started" ]
              , HH.div [ HP.class_ (HH.ClassName "options") ]
                  [ HH.div
                      [ HP.classes [ HH.ClassName "option-button", HH.ClassName "primary", HH.ClassName "upload" ]
                      ]
                      [ HH.div [ HP.class_ (HH.ClassName "option-title") ] [ HH.text "Upload document" ]
                      , HH.p [ HP.class_ (HH.ClassName "option-desc") ] [ HH.text "Select a file from your device" ]
                      , HH.input
                          [ HP.type_ HP.InputFile
                          , HP.accept (Accept.mediaType (MediaType "image/*") <> Accept.mediaType (MediaType "application/pdf"))
                          , HP.multiple true
                          , HP.class_ (HH.ClassName "file-overlay")
                          , HP.disabled state.isProcessing
                          , HE.onChange FilesChanged
                          ]
                      ]
          , HH.button
                      [ HP.classes [ HH.ClassName "option-button", HH.ClassName "secondary" ]
                      , HP.disabled state.isProcessing
              , HE.onClick \_ -> ScanClicked
                      ]
                      [ HH.div [ HP.class_ (HH.ClassName "option-title") ] [ HH.text "Scan with camera" ]
                      , HH.p [ HP.class_ (HH.ClassName "option-desc") ] [ HH.text "Use your camera to capture a page" ]
                      ]
                  ]
              , if Array.length state.uploads > 0 && not state.isProcessing then
                  HH.div [ HP.class_ (HH.ClassName "uploads") ]
                    [ HH.h3 [ HP.class_ (HH.ClassName "uploads-title") ] [ HH.text "Uploaded items" ]
                    , HH.div [ HP.class_ (HH.ClassName "uploads-list") ]
                        (Array.mapWithIndex (renderUploadItem state.isProcessing) state.uploads)
                    ]
                else HH.text ""
              ]
          ]
      , if (not state.isProcessing) && (Array.length state.uploads > 0) then
          HH.div [ HP.class_ (HH.ClassName "process-cta") ]
            [ HH.button
                [ HP.classes [ HH.ClassName "process-button" ]
                , HE.onClick \_ -> ProcessNow
                ]
                [ HH.text "Process now" ]
            ]
        else HH.text ""
      , if state.resultCount > 0 then
          HH.div [ HP.class_ (HH.ClassName "process-cta") ]
            [ HH.button
                [ HP.classes [ HH.ClassName "process-button" ]
                , HE.onClick \_ -> ExportPDF
                ]
                [ HH.text "Export PDF" ]
            ]
        else HH.text ""
      , if state.resultCount > 0 then
          HH.div [ HP.class_ (HH.ClassName "results") ]
            (renderResultItem <$> Array.range 1 state.resultCount)
        else HH.text ""
      ]

  navbar :: forall m1. H.ComponentHTML Action () m1
  navbar =
    HH.nav [ HP.class_ (HH.ClassName "navbar") ]
      [ HH.div [ HP.class_ (HH.ClassName "navbar-inner") ]
          [ HH.div [ HP.class_ (HH.ClassName "nav-left") ]
              [ HH.a [ HP.href "#/", HP.class_ (HH.ClassName "brand") ] [ HH.text "OpenDocScanner" ] ]
          , HH.ul [ HP.class_ (HH.ClassName "nav-center") ]
              [ HH.li_ [ linkItem "#/chat" "Chat", badgeAlpha ]
              , HH.li_ [ linkItem "#/tools" "Tools" ]
              , HH.li_ [ linkItem "#/about" "About" ]
              ]
          , HH.div [ HP.class_ (HH.ClassName "nav-right") ] []
          ]
      ]

  linkItem :: forall m1. String -> String -> H.ComponentHTML Action () m1
  linkItem href label = HH.a [ HP.href href, HP.class_ (HH.ClassName "nav-link") ] [ HH.text label ]

  badgeAlpha :: forall m1. H.ComponentHTML Action () m1
  badgeAlpha = HH.span [ HP.class_ (HH.ClassName "badge-alpha") ] [ HH.text "alpha" ]

  isImage :: Maybe MediaType -> Boolean
  isImage = case _ of
    Just (MediaType mt) -> Str.indexOf (Str.Pattern "image/") mt == Just 0
    _ -> false

  isPdf :: Maybe MediaType -> Boolean
  isPdf = case _ of
    Just (MediaType mt) -> Str.indexOf (Str.Pattern "application/pdf") mt == Just 0
    _ -> false

  renderUploadItem :: forall m. Boolean -> Int -> UploadItem -> H.ComponentHTML Action () m
  renderUploadItem isProcessing ix item =
    HH.div [ HP.class_ (HH.ClassName "upload-item") ]
      [ if isImage item.mime then
          HH.img [ HP.src item.url, HP.class_ (HH.ClassName "upload-thumb") ]
        else if isPdf item.mime then
          HH.span [ HP.class_ (HH.ClassName "upload-icon-pdf") ] [ HH.text "PDF" ]
        else
          HH.span [ HP.class_ (HH.ClassName "upload-icon-file") ] [ HH.text "FILE" ]
      , HH.div [ HP.class_ (HH.ClassName "upload-meta") ]
          [ HH.a [ HP.href item.url, HP.target "_blank", HP.class_ (HH.ClassName "upload-name") ] [ HH.text item.name ]
          , HH.span [ HP.class_ (HH.ClassName "upload-mime") ] [ HH.text (maybe "unknown" (\(MediaType mt) -> mt) item.mime) ]
          ]
      , if isProcessing then HH.text ""
        else HH.button
          [ HP.class_ (HH.ClassName "upload-remove")
          , HE.onClick \_ -> RemoveAt ix
          ]
          [ HH.text "✕" ]
      , HH.div
          [ HP.class_ (HH.ClassName "upload-progress")
          , HP.style ("--progress:" <> show (item.progress * 100.0) <> "%")
          ]
          []
      ]

  renderResultItem :: forall m. Int -> H.ComponentHTML Action () m
  renderResultItem pageNum =
    HH.div [ HP.class_ (HH.ClassName "result-item-wrapper") ]
      [ HH.div [ HP.class_ (HH.ClassName "page-number") ] [ HH.text ("Page " <> show pageNum) ]
      , HH.canvas [ HP.class_ (HH.ClassName "result-canvas"), HP.id ("result-canvas-" <> show pageNum), HE.onClick \_ -> OpenEditor (pageNum - 1) ]
      ]

  renderEditorModal :: forall m1. Maybe Editing -> H.ComponentHTML Action () m1
  renderEditorModal = case _ of
    Nothing -> HH.text ""
    Just ed ->
      HH.div [ HP.class_ (HH.ClassName "editor-backdrop") ]
        [ HH.div [ HP.class_ (HH.ClassName "editor-modal") ]
            [ HH.div [ HP.class_ (HH.ClassName "editor-header") ]
                [ HH.div [ HP.class_ (HH.ClassName "page-number") ] [ HH.text ("Page " <> show (ed.index + 1)) ]
                , HH.div [ HP.class_ (HH.ClassName "editor-actions") ]
                    [ HH.button [ HP.classes [ HH.ClassName "process-button", HH.ClassName "small", HH.ClassName "secondary" ]
                                , HE.onClick \_ -> EditCancel
                                ] [ HH.text "Cancel" ]
                    , HH.button [ HP.classes [ HH.ClassName "process-button", HH.ClassName "small" ]
                                , HE.onClick \_ -> EditProcess
                                ] [ HH.text "Process" ]
                    ]
                ]
            , HH.div [ HP.class_ (HH.ClassName "editor-body") ]
                [ HH.div [ HP.class_ (HH.ClassName "editor-canvas-wrap") ]
                    [ HH.canvas [ HP.id "editor-base-canvas", HP.class_ (HH.ClassName "edit-base"), HP.width ed.width, HP.height ed.height ]
                    , HH.canvas [ HP.id "editor-overlay-canvas", HP.class_ (HH.ClassName "edit-overlay"), HP.width ed.width, HP.height ed.height
                                , HE.onMouseDown EditPointerDown
                                , HE.onMouseMove EditPointerMove
                                , HE.onMouseUp EditPointerUp
                                ]
                    ]
                ]
            ]
        ]

  nearestIndex :: Array Point -> { x :: Number, y :: Number } -> Maybe Int
  nearestIndex pts pos = do
    let withIdx = Array.mapWithIndex Tuple pts
    let pairs = map (\(Tuple i p) -> Tuple i (distance p pos)) withIdx
    let sorted = Array.sortBy (\(Tuple _ a) (Tuple _ b) -> compare a b) pairs
    case Array.head sorted of
      Just (Tuple i d) | d <= 12.0 -> Just i
      _ -> Nothing

  distance :: { x :: Number, y :: Number } -> { x :: Number, y :: Number } -> Number
  distance a b =
    let dx = a.x - b.x
        dy = a.y - b.y
    in sqrt (dx * dx + dy * dy)