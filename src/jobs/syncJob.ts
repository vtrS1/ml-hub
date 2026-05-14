import cron from "node-cron";
import { SyncService } from "../modules/sync/syncService.js";
import { logger } from "../shared/logger/logger.js";

const syncService = new SyncService();

export function startSyncJob(): void {
  cron.schedule("*/15 * * * *", async () => {
    logger.info("⏰ Cron: iniciando sincronização automática");
    try {
      await syncService.syncAllSellers();
      logger.info("✅ Cron: sincronização concluída");
    } catch (err) {
      logger.error({ err }, "❌ Cron: erro na sincronização automática");
    }
  });

  logger.info("🔁 Job de sincronização agendado (a cada 15 min)");
}
