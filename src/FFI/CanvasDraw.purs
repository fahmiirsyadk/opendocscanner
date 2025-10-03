module FFI.CanvasDraw where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Aff (launchAff_, makeAff, nonCanceler)
import Effect.Class (liftEffect)
import Effect.Console (log)
import Graphics.Canvas (CanvasImageSource, drawImage, getContext2D, setCanvasHeight, setCanvasWidth, tryLoadImage)
import Unsafe.Coerce (unsafeCoerce)
import Web.DOM.ParentNode (QuerySelector(..), querySelector)
import Web.HTML (window)
import Web.HTML.HTMLCanvasElement as H
import Web.HTML.HTMLDocument (toParentNode)
import Web.HTML.Window (document)

foreign import naturalWidthImpl :: CanvasImageSource -> Effect Number

foreign import naturalHeightImpl :: CanvasImageSource -> Effect Number

naturalWidth :: CanvasImageSource -> Effect Number
naturalWidth = naturalWidthImpl

naturalHeight :: CanvasImageSource -> Effect Number
naturalHeight = naturalHeightImpl

drawImageToCanvas :: String -> String -> Effect Unit
drawImageToCanvas canvasSelector imageUrl = do
  mElement <- querySelector (QuerySelector canvasSelector) <<< toParentNode =<< (document =<< window)
  case mElement of
    Nothing ->
      log $ "Canvas element with selector '" <> canvasSelector <> "' not found."
    Just element -> do
      case H.fromElement element of
        Nothing ->
          log $ "Element found for '" <> canvasSelector <> "', but it is not a canvas."
        Just htmlCanvas -> do
          let canvas = unsafeCoerce htmlCanvas
          ctx <- getContext2D canvas
          launchAff_ do
            mImgSource <- makeAff \callback -> do
              tryLoadImage imageUrl (callback <<< Right)
              pure nonCanceler
            case mImgSource of
              Nothing ->
                liftEffect $ log $ "Failed to load image from URL: " <> imageUrl
              Just img -> do
                w <- liftEffect $ naturalWidth img
                h <- liftEffect $ naturalHeight img
                liftEffect do
                  log "Image loaded. Resizing canvas and drawing."
                  setCanvasWidth canvas w
                  setCanvasHeight canvas h
                  drawImage ctx img 0.0 0.0
