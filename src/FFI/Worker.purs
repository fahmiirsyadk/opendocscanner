module FFI.Worker
  ( Worker
  , spawn
  , post
  , terminate
  , onMessage
  ) where

import Prelude

import Effect (Effect)
import Effect.Uncurried (EffectFn1, EffectFn2, runEffectFn1, runEffectFn2)

foreign import data Worker :: Type

foreign import spawn :: String -> Effect Worker
foreign import post_ :: Worker -> forall a. a -> Effect Unit
foreign import terminate :: Worker -> Effect Unit
foreign import onMessage_ :: forall a. Worker -> (a -> Effect Unit) -> Effect Unit

post :: forall a. Worker -> a -> Effect Unit
post = post_

onMessage :: forall a. Worker -> (a -> Effect Unit) -> Effect Unit
onMessage = onMessage_
