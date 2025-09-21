module FFI.EditOverlay where

import Prelude
import Effect (Effect)
import Web.Event.Event (Event)

foreign import drawOverlay :: String -> Array { x :: Number, y :: Number } -> Effect Unit
foreign import resizeCanvas :: String -> Int -> Int -> Effect Unit
foreign import offsetXY :: Event -> Effect { x :: Number, y :: Number }

