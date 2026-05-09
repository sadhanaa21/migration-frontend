import type { SapTable } from "../types/migration";

const baseTables: SapTable[] = [
  {
    id: "bp",
    name: "A_BusinessPartner",
    description: "Business partner master records for customers and vendors.",
    module: "Master Data",
    apiPath: "/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner",
    estimatedRows: 12000,
    selected: true,
    destinationPath: "sap-s4/business-partners/business-partners.parquet",
    confidence: 96,
  },
  {
    id: "product",
    name: "A_Product",
    description: "Product master data with product type and descriptions.",
    module: "Material Management",
    apiPath: "/sap/opu/odata/sap/API_PRODUCT_SRV/A_Product",
    estimatedRows: 18500,
    selected: true,
    destinationPath: "sap-s4/products/products.parquet",
    confidence: 94,
  },
  {
    id: "sales",
    name: "A_SalesOrder",
    description: "Sales order headers and nested item information.",
    module: "Sales and Distribution",
    apiPath: "/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder",
    estimatedRows: 42000,
    selected: true,
    destinationPath: "sap-s4/sales-orders/sales-orders.parquet",
    confidence: 92,
  },
  {
    id: "mara",
    name: "MARA",
    description: "ECC-style material general data discovered from metadata catalog.",
    module: "Material Management",
    apiPath: "metadata:sapecc_metadata_config.csv",
    estimatedRows: 83500,
    selected: false,
    destinationPath: "sap-ecc/mara/mara.parquet",
    confidence: 88,
  },
  {
    id: "vbak",
    name: "VBAK",
    description: "Sales document header table discovered from metadata catalog.",
    module: "Sales and Distribution",
    apiPath: "metadata:sapecc_metadata_config.csv",
    estimatedRows: 67000,
    selected: false,
    destinationPath: "sap-ecc/vbak/vbak.parquet",
    confidence: 86,
  },
];

export async function scanSapCatalog(prompt: string): Promise<SapTable[]> {
  await new Promise((resolve) => window.setTimeout(resolve, 700));
  const normalized = prompt.toLowerCase();

  if (normalized.includes("sales")) {
    return baseTables.map((table) => ({
      ...table,
      selected: table.name === "A_SalesOrder",
    }));
  }

  if (normalized.includes("product") || normalized.includes("material")) {
    return baseTables.map((table) => ({
      ...table,
      selected: table.name === "A_Product",
    }));
  }

  if (normalized.includes("customer") || normalized.includes("partner")) {
    return baseTables.map((table) => ({
      ...table,
      selected: table.id === "bp",
    }));
  }

  return baseTables;
}
