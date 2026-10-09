/// <reference types="vite/client" />

// Known exceptions to "core takes injected config": build-time flags read from import.meta.env.
// VITE_NSFW_SAFETY and VITE_INSTANCE_BUILD are replaced by injected config in the config-injection step.
interface ImportMetaEnv {
  readonly VITE_INSTANCE_BUILD?: string
  readonly VITE_NSFW_SAFETY?: string
}
