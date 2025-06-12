import "broadcastchannel-polyfill";
import "construct-style-sheets-polyfill";
import "./shoelace";
import "./assets/fonts/Inter/inter.css";
import "./assets/fonts/Recursive/recursive.css";
import "./styles.css";

import { theme } from "@/theme";

// Make theme CSS available in document
document.adoptedStyleSheets = [theme];
