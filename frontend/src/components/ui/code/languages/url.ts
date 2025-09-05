import type { LanguageFn } from "highlight.js";

const url: LanguageFn = function () {
  // Protocol patterns
  const SECURE_PROTOCOL = /https:\/\//;
  const INSECURE_PROTOCOL = /http:\/\//;
  const OTHER_PROTOCOL = /(?:ftp|file|mailto|tel|ssh):\/\//;

  // Domain components
  const PORT = /:\d+/;

  // Path and query components
  const PATH_SEGMENT = /\/[^?#\s]*/;
  const QUERY_START = /\?/;
  const PARAM_SEPARATOR = /&/;
  const FRAGMENT = /#[^\s]*/;

  const DOMAIN_STYLE = "domain";
  const KEY_STYLE = "attr";
  const VALUE_STYLE = "name";

  return {
    name: "URL",
    aliases: ["uri"],
    case_insensitive: false,
    contains: [
      // Insecure HTTP protocol
      {
        scope: "protocol",
        begin: INSECURE_PROTOCOL,
        relevance: 10,
      },
      // Secure HTTPS protocol
      {
        scope: "protocol",
        begin: SECURE_PROTOCOL,
        relevance: 5,
      },
      // Other protocols
      {
        scope: "protocol",
        begin: OTHER_PROTOCOL,
        relevance: 3,
      },
      // Domain after protocol (handles URLs with and without authentication)
      {
        scope: DOMAIN_STYLE,
        begin: /(?<=:\/\/)(?:[^@:\s]+(?::[^@\s]*)?@)?[^/?#\s]+/,
        relevance: 15,
      },
      // Bare domains
      {
        scope: DOMAIN_STYLE,
        begin: /^(?![a-zA-Z]+:\/\/)[^/?#\s]+/,
        relevance: 8,
        contains: [
          // Root domain within bare domain
          {
            scope: DOMAIN_STYLE,
            begin:
              /(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}/,
            relevance: 15,
          },
        ],
      },
      // Port number
      {
        scope: "number",
        begin: PORT,
        relevance: 2,
      },
      // Path segments
      {
        scope: "path",
        begin: PATH_SEGMENT,
        relevance: 1,
      },
      // Query start (first ?)
      {
        scope: "protocol",
        begin: QUERY_START,
        relevance: 0,
        starts: {
          end: /(?=&|#|$)/,
          contains: [
            // First parameter key
            {
              scope: KEY_STYLE,
              begin: /[^=&#\s]+/,
              end: /(?==|&|#|$)/,
              excludeEnd: true,
            },
            // First parameter value
            {
              scope: VALUE_STYLE,
              begin: /=/,
              end: /(?=&|#|$)/,
              excludeBegin: true,
            },
          ],
        },
      },
      // Subsequent parameters (& separated)
      {
        scope: "protocol",
        begin: PARAM_SEPARATOR,
        contains: [
          // Parameter separator (&)
          {
            scope: "protocol",
            begin: PARAM_SEPARATOR,
            relevance: 0,
          },
          // Parameter key
          {
            scope: KEY_STYLE,
            begin: /[^=&#\s]+/,
            end: /(?==|&|#|$)/,
            excludeEnd: true,
          },
          // Parameter value
          {
            scope: VALUE_STYLE,
            begin: /=/,
            end: /(?=&|#|$)/,
            excludeBegin: true,
          },
        ],
        relevance: 5,
      },
      // Fragment identifier
      {
        scope: "attr",
        begin: FRAGMENT,
        relevance: 2,
      },
    ],
  };
};

export { url as default };
