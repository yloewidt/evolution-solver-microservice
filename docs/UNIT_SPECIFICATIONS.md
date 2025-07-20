# Evolution Solver Unit Specifications

## Standard Unit: Millions USD ($M)

All monetary values throughout the system use **millions of USD** as the standard unit.

## API Input Parameters

| Parameter | Unit | Example | Description |
|-----------|------|---------|-------------|
| `maxCapex` | $M | 0.1 = $100K | Maximum capital expenditure allowed |
| `minProfits` | $M | 50 = $50M | Minimum NPV required |
| `diversificationUnit` | $M | 0.05 = $50K | Unit of capital for portfolio diversification |
| `generations` | Count | 10 | Number of evolution generations |
| `populationSize` | Count | 20 | Ideas per generation |
| `topSelectCount` | Count | 3 | Top ideas to carry forward |
| `offspringRatio` | Ratio | 0.7 = 70% | Percentage of offspring vs wildcards |

## Internal Data Flow

### Variator Phase
- **Input**: maxCapex in $M
- **Output**: Ideas with descriptions mentioning capital limits

### Enricher Phase  
- **Input**: Ideas from variator
- **Output**: Business case with:
  - `npv_success`: $M (e.g., 125.5 = $125.5M)
  - `capex_est`: $M (e.g., 0.075 = $75K)
  - `timeline_months`: Months (e.g., 18)
  - `likelihood`: Probability 0-1 (e.g., 0.65 = 65%)
  - `yearly_cashflows`: Array in $M

### Ranker Phase
- **Input**: Enriched ideas with above units
- **Formula** (simplified): 
  ```
  score = (p × NPV - (1-p) × CAPEX) / √(CAPEX/C0)
  ```
  All values in millions USD
- **Filtering**:
  - Rejects if capex_est > maxCapex (both in $M)
  - Rejects if npv_success < minProfits (both in $M)

## Examples

### API Request Example:
```json
{
  "parameters": {
    "maxCapex": 0.1,           // $100K max capital
    "minProfits": 50,          // $50M minimum NPV
    "diversificationUnit": 0.05 // $50K per investment unit
  }
}
```

### Enricher Output Example:
```json
{
  "business_case": {
    "npv_success": 125.5,      // $125.5M NPV
    "capex_est": 0.075,        // $75K capital required
    "timeline_months": 18,
    "likelihood": 0.65,
    "yearly_cashflows": [10, 25, 40, 45, 50]  // $M per year
  }
}
```