/**
 * JSON schemas for structured outputs from OpenAI API
 */

export const VariatorResponseSchema = {
  type: "json_schema",
  json_schema: {
    name: "variator_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              idea_id: {
                type: "string",
                description: "Unique identifier for the idea"
              },
              description: {
                type: "string",
                description: "Brief description of the business idea"
              },
              core_mechanism: {
                type: "string",
                description: "Core mechanism of how the idea generates value"
              }
            },
            required: ["idea_id", "description", "core_mechanism"],
            additionalProperties: false
          }
        }
      },
      required: ["ideas"],
      additionalProperties: false
    }
  }
};

export const EnricherResponseSchema = {
  type: "json_schema",
  json_schema: {
    name: "enricher_response",
    strict: true,
    schema: {
      type: "object",
      properties: {
        enriched_ideas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              idea_id: {
                type: "string"
              },
              description: {
                type: "string"
              },
              core_mechanism: {
                type: "string"
              },
              business_case: {
                type: "object",
                properties: {
                  npv_success: {
                    type: "number",
                    description: "5-year NPV if successful in millions USD"
                  },
                  capex_est: {
                    type: "number",
                    description: "Initial capital required in millions USD"
                  },
                  timeline_months: {
                    type: "integer",
                    description: "Time to first revenue in months"
                  },
                  likelihood: {
                    type: "number",
                    minimum: 0,
                    maximum: 1,
                    description: "Success probability (0-1)"
                  },
                  risk_factors: {
                    type: "array",
                    items: {
                      type: "string"
                    },
                    description: "Key risks (technical, market, regulatory, execution)"
                  },
                  yearly_cashflows: {
                    type: "array",
                    items: {
                      type: "number"
                    },
                    minItems: 5,
                    maxItems: 5,
                    description: "5 yearly cash flows in millions USD"
                  }
                },
                required: [
                  "npv_success",
                  "capex_est",
                  "timeline_months",
                  "likelihood",
                  "risk_factors",
                  "yearly_cashflows"
                ],
                additionalProperties: false
              }
            },
            required: ["idea_id", "description", "core_mechanism", "business_case"],
            additionalProperties: false
          }
        }
      },
      required: ["enriched_ideas"],
      additionalProperties: false
    }
  }
};