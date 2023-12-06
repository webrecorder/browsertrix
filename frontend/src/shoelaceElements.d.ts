// This is hacky and I feel like there should be a better way to do this, but I'm not sure what it is — Shoelace doesn't seem to export their attribute names when they don't match the property names.
// Lit-analyzer doesn't even always even pick this up :/
// For now, this lets us use ts-analyzer without it throwing errors about kebab-cased attributes in shoelace components. Feel free to add to this as needed!
//   - emma, 2023-12-06

import {
  type SlTextarea,
  type SlFormatDate,
  type SlInput,
  type SlSelect,
} from "@shoelace-style/shoelace";

class SlInputAttributes {
  "help-text": SlInput["helpText"];
}

class SlFormatDateAttributes {
  "time-zone-name": SlFormatDate["timeZoneName"];
  "time-zone": SlFormatDate["timeZone"];
  "hour-format": SlFormatDate["hourFormat"];
}

class SlTextareaAttributes {
  "help-text": SlTextarea["helpText"];
}

class SlSelectAttributes {
  "max-options-visible": SlSelect["maxOptionsVisible"];
}

declare global {
  interface HTMLElementTagNameMap {
    "sl-input": SlInput & SlInputAttributes;
    "sl-format-date": SlFormatDate & SlFormatDateAttributes;
    "sl-textarea": SlTextarea & SlTextareaAttributes;
    "sl-select": SlSelect & SlSelectAttributes;
  }
}
