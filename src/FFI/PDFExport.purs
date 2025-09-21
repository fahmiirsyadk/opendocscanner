module FFI.PDFExport where

import Prelude
import Effect (Effect)

type PageSpec = { canvasSelector :: String }

foreign import exportPdf :: Array PageSpec -> Effect Unit

