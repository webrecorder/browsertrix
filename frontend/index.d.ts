declare module "*.avif";
declare module "*.svg";
declare module "*.webp";
declare module "*.css";
declare module "regex-colorizer";

/**
 * Flattens to a normal string type, but preserves string literal suggestions
 */
type AnyString = string & {};
