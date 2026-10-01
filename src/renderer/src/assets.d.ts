/** Vite hands back an imported image as its url. */
declare module '*.png' {
  const url: string
  export default url
}
