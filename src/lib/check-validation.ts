import { ServiceConfig, ServiceStatus } from "@/types";

export interface JsonValidationResult {
  status: ServiceStatus;
  errorMessage: string | null;
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce((acc: unknown, key: string) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function validateJsonResponse(
  service: ServiceConfig,
  json: Record<string, unknown>
): JsonValidationResult {
  if (!service.jsonPath) {
    return {
      status: "operational",
      errorMessage: null,
    };
  }

  const value = getNestedValue(json, service.jsonPath);
  const stringValue =
    typeof value === "string"
      ? value.trim()
      : value === undefined || value === null
        ? ""
        : JSON.stringify(value);

  if (service.jsonFailureKeywords?.length) {
    const matchedKeyword = service.jsonFailureKeywords.find((keyword) =>
      stringValue.toLowerCase().includes(keyword.toLowerCase())
    );

    if (matchedKeyword) {
      return {
        status: "degraded",
        errorMessage: `JSON path "${service.jsonPath}" contains failure keyword "${matchedKeyword}"`,
      };
    }
  }

  if (service.jsonExpectedValue !== undefined && String(value) !== service.jsonExpectedValue) {
    return {
      status: "degraded",
      errorMessage: `JSON path "${service.jsonPath}" returned "${value}", expected "${service.jsonExpectedValue}"`,
    };
  }

  if (service.jsonMinLength !== undefined && stringValue.length < service.jsonMinLength) {
    return {
      status: "degraded",
      errorMessage: `JSON path "${service.jsonPath}" was shorter than ${service.jsonMinLength} characters`,
    };
  }

  if (value === undefined || value === null || stringValue.length === 0) {
    return {
      status: "degraded",
      errorMessage: `JSON path "${service.jsonPath}" was empty`,
    };
  }

  return {
    status: "operational",
    errorMessage: null,
  };
}
