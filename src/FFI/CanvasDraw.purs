module FFI.CanvasDraw (drawImageToCanvas) where

import Prelude
import Effect (Effect)

foreign import drawImageToCanvas :: String -> String -> Effect Unit


