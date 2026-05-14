import axios from "axios";
import { AppError } from "./AppError.js";
import { logger } from "../logger/logger.js";

interface MLCause {
  code?: string;
  message?: string;
  field?: string;
  location?: string;
}

interface MLErrorResponse {
  message?: string;
  error?: string;
  cause?: MLCause[] | string;
  error_description?: string;
  status?: number;
}

/**
 * Extrai a mensagem de erro da API do Mercado Livre (Axios) e lança um AppError legível.
 * Trata especialmente o erro `body.required_fields`, listando os campos faltantes.
 */
export function handleMlError(err: unknown, fallbackMessage: string): never {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as MLErrorResponse | undefined;
    const status = err.response?.status ?? 502;

    // Loga o corpo completo para facilitar debug
    logger.error({ mlStatus: status, mlBody: data }, "Erro da API Mercado Livre");

    // Erro de campos obrigatórios — lista os campos faltantes
    if (
      data?.message === "body.required_fields" &&
      Array.isArray(data?.cause)
    ) {
      const fields = (data.cause as MLCause[])
        .map((c) => c.field ?? c.message ?? c.code)
        .filter(Boolean)
        .join(", ");
      const msg = fields
        ? `Campos obrigatórios não preenchidos: ${fields}`
        : "Campos obrigatórios não preenchidos para esta categoria";
      throw new AppError(msg, 422);
    }

    // Validation error — tenta extrair causas detalhadas
    if (data?.message === "Validation error" && Array.isArray(data?.cause)) {
      const details = (data.cause as MLCause[])
        .map((c) => [c.field, c.message, c.code].filter(Boolean).join(": "))
        .filter(Boolean)
        .join(" | ");
      const msg = details
        ? `Mercado Livre: erro de validação — ${details}`
        : "Mercado Livre: erro de validação";
      throw new AppError(msg, 422);
    }

    const mlMessage =
      data?.message ||
      data?.error_description ||
      (typeof data?.cause === "string" ? data.cause : undefined) ||
      data?.error ||
      err.message ||
      fallbackMessage;

    throw new AppError(`Mercado Livre: ${mlMessage}`, status);
  }

  throw err;
}
