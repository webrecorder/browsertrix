import themeCSS from "./theme.css";

// Create a new style sheet from the compiled theme CSS
export const theme = new CSSStyleSheet();
theme.replaceSync(themeCSS);
