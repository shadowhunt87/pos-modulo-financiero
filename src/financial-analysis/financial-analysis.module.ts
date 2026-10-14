import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module.js';
import { FinancialAnalysisController } from './financial-analysis.controller.js';
import { FinancialAnalysisService } from './financial-analysis.service.js';

// ReportsModule exporta FinancialRatiosGenerator: se inyecta, no se copia ni se modifica
@Module({
  imports: [ReportsModule],
  controllers: [FinancialAnalysisController],
  providers: [FinancialAnalysisService],
})
export class FinancialAnalysisModule {}
