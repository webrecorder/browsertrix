import express, { Request, Response } from "express";
import { render, pretty as makePretty } from "@react-email/components";

import * as templates from "./emails/index.js";
import z from "zod";
import React from "react";

// Define types for template structure
type TemplateModule = {
  schema: z.ZodSchema<any>;
  default: (props: any) => React.ReactElement;
};

type Templates = Record<string, TemplateModule>;

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Health check endpoint
app.get("/health", (_, res) => {
  res.status(200).json({ status: "ok" });
});

// Email template endpoint
app.post("/api/emails/:templateName", async (req: Request, res: Response) => {
  try {
    const { templateName } = req.params;
    const templateKey = templateName as keyof typeof templates;
    const { pretty = false } = req.body;

    if (!templateName || !(templateKey in templates)) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    // Type assertion to handle dynamic template access
    const templateModule = (templates as Templates)[templateKey];
    const { schema, default: Template } = templateModule;

    // Parse props with the specific template's schema
    const props = schema.parse(req.body);
    const [html, plainText] = await Promise.all([
      pretty
        ? makePretty(await render(Template(props)))
        : render(Template(props)),
      render(Template(props), { plainText: true }),
    ]);
    res.send({ html, plainText });
  } catch (error) {
    console.error("Error rendering email:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: "Invalid request data",
        details: error.errors,
      });
    } else {
      res.status(500).json({ error: "Failed to render email template" });
    }
  }
});

app.listen(port, () => {
  console.log(`Email API server running at http://localhost:${port}`);
});
