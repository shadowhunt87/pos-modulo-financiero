import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { EmployeesService } from './employees.service.js';
import { PayrollSettingsService } from './payroll-settings.service.js';
import { PayrollService } from './payroll.service.js';
import {
  CreateDepartmentDto, CreateEmployeeDto, CreatePayrollConceptDto, CreatePayrollRunDto, ListEmployeesQuery, ListPayrollConceptsQuery,
  ListPayrollRunsQuery, MonthQuery, PayPayrollDto, SetPayrollItemsDto, TerminateEmployeeDto, UpdateDepartmentDto, UpdateEmployeeDto,
  UpdatePayrollConceptDto, UpdatePayrollSettingsDto, VoidPayrollDto,
} from './dto.js';

const { ADMIN, ACCOUNTANT } = UserRole;

/**
 * RRHH y nómina (P3). Salarios y documentos son datos sensibles: TODO el módulo es solo para ADMIN y ACCOUNTANT,
 * también la lectura (AUDITOR y VIEWER no entran).
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ADMIN, ACCOUNTANT)
@Controller('hr')
export class HrController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly settings: PayrollSettingsService,
    private readonly payroll: PayrollService,
  ) {}

  // ---------------- Departamentos ----------------
  @Post('departments')
  createDepartment(@Body() dto: CreateDepartmentDto, @CurrentUser() user: AuthUser) {
    return this.employees.createDepartment(dto, user);
  }

  @Get('departments')
  listDepartments(@CurrentUser() user: AuthUser) {
    return this.employees.listDepartments(user);
  }

  @Patch('departments/:id')
  updateDepartment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDepartmentDto, @CurrentUser() user: AuthUser) {
    return this.employees.updateDepartment(id, dto, user);
  }

  // ---------------- Empleados ----------------
  @Post('employees')
  createEmployee(@Body() dto: CreateEmployeeDto, @CurrentUser() user: AuthUser) {
    return this.employees.create(dto, user);
  }

  @Get('employees')
  listEmployees(@Query() q: ListEmployeesQuery, @CurrentUser() user: AuthUser) {
    return this.employees.list(q, user);
  }

  @Get('employees/:id')
  getEmployee(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.employees.get(id, user);
  }

  @Patch('employees/:id')
  updateEmployee(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() user: AuthUser) {
    return this.employees.update(id, dto, user);
  }

  // Salida de la empresa (fecha y motivo); deja de entrar en las nóminas posteriores
  @Post('employees/:id/terminate')
  terminateEmployee(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TerminateEmployeeDto, @CurrentUser() user: AuthUser) {
    return this.employees.terminate(id, dto, user);
  }

  // ---------------- Conceptos y configuración ----------------
  @Post('payroll-concepts')
  createConcept(@Body() dto: CreatePayrollConceptDto, @CurrentUser() user: AuthUser) {
    return this.settings.createConcept(dto, user);
  }

  @Get('payroll-concepts')
  listConcepts(@Query() q: ListPayrollConceptsQuery, @CurrentUser() user: AuthUser) {
    return this.settings.listConcepts(q, user);
  }

  @Patch('payroll-concepts/:id')
  updateConcept(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePayrollConceptDto, @CurrentUser() user: AuthUser) {
    return this.settings.updateConcept(id, dto, user);
  }

  @Get('payroll-settings')
  getSettings(@CurrentUser() user: AuthUser) {
    return this.settings.getSettings(user);
  }

  @Put('payroll-settings')
  updateSettings(@Body() dto: UpdatePayrollSettingsDto, @CurrentUser() user: AuthUser) {
    return this.settings.updateSettings(dto, user);
  }

  // ---------------- Nóminas ----------------
  // Crea el borrador ya calculado (nómina regular o regalía pascual)
  @Post('payroll-runs')
  createRun(@Body() dto: CreatePayrollRunDto, @CurrentUser() user: AuthUser) {
    return this.payroll.create(dto, user);
  }

  @Get('payroll-runs')
  listRuns(@Query() q: ListPayrollRunsQuery, @CurrentUser() user: AuthUser) {
    return this.payroll.list(q, user);
  }

  @Get('payroll-runs/:id')
  getRun(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.get(id, user);
  }

  // Novedades de un empleado (reemplaza las anteriores) y recálculo de su línea
  @Put('payroll-runs/:id/lines/:lineId/items')
  setItems(
    @Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string,
    @Body() dto: SetPayrollItemsDto, @CurrentUser() user: AuthUser,
  ) {
    return this.payroll.setItems(id, lineId, dto, user);
  }

  @Post('payroll-runs/:id/recalculate')
  recalculate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.recalculate(id, user);
  }

  @Delete('payroll-runs/:id')
  removeRun(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.remove(id, user);
  }

  @Post('payroll-runs/:id/post')
  postRun(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payroll.post(id, user);
  }

  @Post('payroll-runs/:id/pay')
  payRun(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayPayrollDto, @CurrentUser() user: AuthUser) {
    return this.payroll.pay(id, dto, user);
  }

  @Post('payroll-runs/:id/void')
  voidRun(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidPayrollDto, @CurrentUser() user: AuthUser) {
    return this.payroll.void(id, dto, user);
  }

  // ---------------- Reportes ----------------
  @Get('reports/tss')
  tss(@Query() q: MonthQuery, @CurrentUser() user: AuthUser) {
    return this.payroll.tssReport(q, user);
  }

  @Get('reports/ir3')
  ir3(@Query() q: MonthQuery, @CurrentUser() user: AuthUser) {
    return this.payroll.ir3Report(q, user);
  }
}
