/** Static assets imported from this package are resolved by the consuming app's bundler (Vite). */
declare module "*.svg" {
  const url: string;
  export default url;
}
