import { state, property } from "lit/decorators.js";
import { msg, localized } from "@lit/localize";
import { createMachine, interpret, assign } from "@xstate/fsm";

import LiteElement, { html } from "../utils/LiteElement";

type JoinContext = {
  successMessage?: string;
  serverError?: string;
  fieldErrors: { [fieldName: string]: string };
};
type JoinSuccessEvent = {
  type: "SUCCESS";
  detail: {
    successMessage?: JoinContext["successMessage"];
  };
};
type JoinErrorEvent = {
  type: "ERROR";
  detail: {
    serverError?: JoinContext["serverError"];
    fieldErrors?: JoinContext["fieldErrors"];
  };
};
type JoinEvent =
  | { type: "SUBMIT_SIGN_UP" }
  | { type: "ACCEPT_INVITE" }
  | JoinSuccessEvent
  | JoinErrorEvent;
type JoinTypestate =
  | {
      value: "initial";
      context: JoinContext;
    }
  | {
      value: "submittingForm";
      context: JoinContext;
    }
  | {
      value: "acceptInvite";
      context: JoinContext;
    }
  | {
      value: "acceptingInvite";
      context: JoinContext;
    };

const initialContext = {
  fieldErrors: {},
};

const machine = createMachine<JoinContext, JoinEvent, JoinTypestate>(
  {
    id: "join",
    initial: "initial",
    context: initialContext,
    states: {
      ["initial"]: {
        on: {
          SUBMIT_SIGN_UP: "submittingForm",
        },
      },
      ["submittingForm"]: {
        on: {
          SUCCESS: "acceptInvite",
          ERROR: {
            target: "initial",
            actions: "setError",
          },
        },
      },
      ["acceptInvite"]: {
        on: {
          ACCEPT_INVITE: "acceptingInvite",
        },
      },
      ["acceptingInvite"]: {
        on: {
          SUCCESS: {
            target: "acceptInvite",
            actions: "setSucessMessage",
          },
          ERROR: {
            target: "acceptInvite",
            actions: "setError",
          },
        },
      },
    },
  },
  {
    actions: {
      setSucessMessage: assign((context, event) => ({
        ...context,
        ...(event as JoinSuccessEvent).detail,
      })),
      setError: assign((context, event) => ({
        ...context,
        ...(event as JoinErrorEvent).detail,
      })),
    },
  }
);

@localized()
export class Join extends LiteElement {
  private joinStateService = interpret(machine);

  @property({ type: String })
  token?: string;

  @state()
  private joinState = machine.initialState;

  firstUpdated() {
    // Enable state machine
    this.joinStateService.subscribe((state) => {
      this.joinState = state;
    });

    this.joinStateService.start();
  }

  disconnectedCallback() {
    this.joinStateService.stop();
  }

  render() {
    return html`TODO`;
  }

  private async accept() {
    const resp = await fetch(`/api/invite/accept/${this.token}`);

    switch (resp.status) {
      case 200:
        this.joinStateService.send("SUCCESS");
        // this.navTo("/log-in");
        break;
      case 401:
        const { detail } = await resp.json();
        if (detail === "Unauthorized") {
          this.joinStateService.send({
            type: "ERROR",
            detail: {
              fieldErrors: {
                password: msg("This invitation is not valid."),
              },
            },
          });
          break;
        }
      default:
        this.joinStateService.send({
          type: "ERROR",
          detail: {
            fieldErrors: {
              password: msg("Something unexpected went wrong"),
            },
          },
        });
        break;
    }
  }
}
