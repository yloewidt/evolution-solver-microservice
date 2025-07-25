/**
 * JSON Schemas for OpenAI Structured Outputs
 * These schemas guarantee 100% compliant responses from the API
 * 
 * IMPORTANT: Structured outputs require root level to be an object, not an array
 */

export const VariatorResponseSchema = {
  type: "json_schema",
  json_schema: {
    name: "variator_response",
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
                description: "Unique identifier for the idea (e.g., VAR_GEN1_001)"
              },
              title: {
                type: "string",
                description: "Short, catchy title for the idea"
              },
              description: { 
                type: "string",
                description: "2-3 sentence description of the business idea"
              },
              core_mechanism: { 
                type: "string",
                description: "1-2 sentence explanation of how the idea works"
              },
              is_offspring: { 
                type: "boolean",
                description: "Whether this idea is based on an existing top performer"
              }
            },
            required: ["idea_id", "title", "description", "core_mechanism", "is_offspring"],
            additionalProperties: false
          },
          // Dynamic size based on request
        }
      },
      required: ["ideas"],
      additionalProperties: false
    },
    strict: true
  }
};

export const SingleIdeaEnricherResponseSchema = {
  type: "json_schema",
  json_schema: {
    name: "single_idea_enricher_response",
    schema: {
      type: "object",
      properties: {
        idea_id: { 
          type: "string",
          description: "Must match the input idea_id"
        },
        title: {
          type: "string", 
          description: "Must match the input title"
        },
        description: { 
          type: "string",
          description: "Must match the input description"
        },
        business_case: {
          type: "object",
          properties: {
            npv_success: { 
              type: "number",
              description: "NPV if successful, in millions USD (10% discount rate)"
            },
            capex_est: { 
              type: "number", 
              minimum: 0.05,
              description: "Estimated CAPEX in millions USD (minimum $50K)"
            },
            timeline_months: { 
              type: "integer", 
              minimum: 1,
              description: "Implementation timeline in months"
            },
            likelihood: { 
              type: "number", 
              minimum: 0, 
              maximum: 1,
              description: "Probability of success (0-1)"
            },
            risk_factors: {
              type: "array",
              items: { type: "string" },
              minItems: 1,
              description: "Key risk factors for the idea"
            },
            yearly_cashflows: {
              type: "array",
              items: { type: "number" },
              minItems: 5,
              maxItems: 5,
              description: "Expected cashflows for years 1-5 in millions USD"
            }
          },
          required: ["npv_success", "capex_est", "timeline_months", "likelihood", "risk_factors", "yearly_cashflows"],
          additionalProperties: false
        }
      },
      required: ["idea_id", "title", "description", "business_case"],
      additionalProperties: false
    },
    strict: true
  }
};

export const EnricherResponseSchema = {
  type: "json_schema",
  json_schema: {
    name: "enricher_response",
    schema: {
      type: "object",
      properties: {
        enriched_ideas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              idea_id: { 
                type: "string",
                description: "Must match the input idea_id"
              },
              title: {
                type: "string", 
                description: "Must match the input title"
              },
              description: { 
                type: "string",
                description: "Must match the input description"
              },
              business_case: {
                type: "object",
                properties: {
                  npv_success: { 
                    type: "number",
                    description: "NPV if successful, in millions USD (10% discount rate)"
                  },
                  capex_est: { 
                    type: "number", 
                    minimum: 0.05,
                    description: "Estimated CAPEX in millions USD (minimum $50K)"
                  },
                  timeline_months: { 
                    type: "integer", 
                    minimum: 1,
                    description: "Implementation timeline in months"
                  },
                  likelihood: { 
                    type: "number", 
                    minimum: 0, 
                    maximum: 1,
                    description: "Probability of success (0-1)"
                  },
                  risk_factors: {
                    type: "array",
                    items: { type: "string" },
                    minItems: 1,
                    description: "Key risk factors for the idea"
                  },
                  yearly_cashflows: {
                    type: "array",
                    items: { type: "number" },
                    minItems: 5,
                    maxItems: 5,
                    description: "Expected cashflows for years 1-5 in millions USD"
                  }
                },
                required: ["npv_success", "capex_est", "timeline_months", "likelihood", "risk_factors", "yearly_cashflows"],
                additionalProperties: false
              }
            },
            required: ["idea_id", "title", "description", "business_case"],
            additionalProperties: false
          }
        }
      },
      required: ["enriched_ideas"],
      additionalProperties: false
    },
    strict: true
  }
};

