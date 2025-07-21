import express, { Request, Response } from "express";
import { pinoHttp } from "pino-http";
import { pino } from "pino";
import { render, pretty as makePretty } from "@react-email/components";

import * as templates from "./emails/index.js";
import z from "zod";
import React from "react";

// Define types for template structure
type TemplateModule = {
  schema: z.ZodSchema<any>;
  default: (props: any) => React.ReactElement;
  subject: (props: any) => string;
};

type Templates = Record<string, TemplateModule>;

const log = pino({
  level: process.env.LOG_LEVEL || "info",
  name: "emails-api",
  ...(process.env.NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
        },
      }
    : undefined),
});

const app = express();
app.use(pinoHttp({ logger: log }));
const port = process.env.PORT || process.env.LOCAL_EMAILS_PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  req.log.trace({ msg: "Health check successful" });
  res.status(200).json({ status: "ok" });
});

// Email template endpoint
app.post("/api/emails/:templateName", async (req: Request, res: Response) => {
  try {
    const { templateName } = req.params;
    const templateKey = templateName as keyof typeof templates;
    const { pretty = false } = req.body;

    if (!templateName || !(templateKey in templates)) {
      req.log.error({ msg: "Template not found", templateName });
      res.status(404).json({ error: "Template not found" });
      return;
    }

    // Type assertion to handle dynamic template access
    const templateModule = (templates as Templates)[templateKey];
    const { schema, default: Template, subject } = templateModule;

    // Parse props with the specific template's schema
    const props = schema.parse(req.body);
    const [html, plainText] = await Promise.all([
      pretty
        ? makePretty(await render(Template(props)))
        : render(Template(props)),
      render(Template(props), { plainText: true }),
    ]);
    req.log.debug({
      msg: "Email template rendered successfully",
      templateName,
      props,
    });
    res.send({ html, plainText, subject: subject(props) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      req.log.error({
        msg: "Failed to render email template: zod validation error",
        issues: error.issues,
      });
      res.status(400).json({
        error: "Invalid request data",
        details: error.issues,
      });
    } else {
      req.log.error({ msg: "Failed to render email template", error });
      res.status(500).json({ error: "Failed to render email template" });
    }
  }
});

app.listen(port, () => {
  log.info(`Email API server running at http://localhost:${port}`);
});
