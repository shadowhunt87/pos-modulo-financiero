import { Modal } from './modal';
import { Toasts } from './toasts';
import { ConfirmHost } from './confirm-host';
import { Pagination } from './pagination';
import { StatusBadge } from './badge';
import { Combobox } from './combobox';
import { ChartView } from './chart';
import { PIPES } from '../pipes/pipes';
import { ErrorNotice as ErrorNoticeCmp } from './error-notice';
import { EmptyState as EmptyStateCmp } from './empty-state';
import { DateInput } from './date-input';

export { Modal, Toasts, ConfirmHost, Pagination, StatusBadge, Combobox, ChartView };
export type { ComboOption } from './combobox';
/** Todo el kit compartido: `imports: [...UI]` en cualquier componente. */
// ErrorNotice y EmptyState también en el kit (E4: errores que explican y estados vacíos con botón en todas las pantallas)
export const UI = [Modal, Pagination, StatusBadge, Combobox, ChartView, ErrorNoticeCmp, EmptyStateCmp, DateInput, ...PIPES] as const;
export { AttachmentsPanel } from './attachments';
export type { AttachmentParent } from './attachments';
export { ExportButtons } from './export-buttons';
export { Breadcrumbs } from './breadcrumbs';
export { NextStep } from './next-step';
export { ErrorNotice } from './error-notice';
export { FieldHelp } from './field-help';
export { EmptyState } from './empty-state';
export { DateInput } from './date-input';
