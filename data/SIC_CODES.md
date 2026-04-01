# SIC Code Reference

This file provides context for interpreting the SIC codes in Companies House enrichment data.

## SIC Codes in Sample Data

### Food & Beverage
- **10710**: Manufacture of bread; manufacture of fresh pastry goods and cakes
- **10830**: Processing of tea and coffee
- **46370**: Wholesale of coffee, tea, cocoa and spices

### Manufacturing
- **25110**: Manufacture of metal structures and parts of structures
- **25620**: Machining
- **28990**: Manufacture of other special-purpose machinery n.e.c.

### Healthcare
- **75000**: Veterinary activities
- **86230**: Dental practice activities

### Logistics & Transportation
- **49410**: Freight transport by road
- **52101**: Warehousing and storage

### Construction
- **41201**: Construction of domestic buildings
- **43999**: Other specialized construction activities n.e.c.

### Technology
- **62012**: Business and domestic software development
- **64999**: Financial intermediation not elsewhere classified

## Usage in Pipeline

SIC codes can be used to:
1. **Enhance sector detection** - Supplement or validate the `sector_hint` field
2. **Improve ICP scoring** - Target sectors get bonus points
3. **Inform email generation** - Reference sector-specific needs

## Example Mapping

```python
SIC_TO_SECTOR = {
    "10710": "Food & Beverage",
    "10830": "Food & Beverage",
    "46370": "Food & Beverage",
    "25110": "Manufacturing",
    "25620": "Manufacturing",
    "28990": "Manufacturing",
    "75000": "Healthcare",
    "86230": "Healthcare",
    "49410": "Logistics",
    "52101": "Logistics",
    "41201": "Construction",
    "43999": "Construction",
    "62012": "Technology",
    "64999": "Technology"
}

TARGET_SECTORS = {
    "Manufacturing",
    "Healthcare",
    "Food & Beverage",
    "Construction",
    "Logistics"
}
```

## Notes
- Some companies have multiple SIC codes (primary + secondary activities)
- SIC codes are UK Standard Industrial Classification codes
- Not all sectors are ideal for Allica's SME lending products
- Technology/startups typically fall outside core ICP
