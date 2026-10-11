import { Modal } from './modal';
import { Toasts } from './toasts';
import { ConfirmHost } from './confirm-host';
import { Pagination } from './pagination';
import { StatusBadge } from './badge';
import { Combobox } from './combobox';
import { ChartView } from './chart';
import { PIPES } from '../pipes/pipes';

export { Modal, Toasts, ConfirmHost, Pagination, StatusBadge, Combobox, ChartView };
export type { ComboOption } from './combobox';
/** Todo el kit compartido: `imports: [...UI]` en cualquier componente. */
export const UI = [Modal, Pagination, StatusBadge, Combobox, ChartView, ...PIPES] as const;
export { AttachmentsPanel } from './attachments';
export type { AttachmentParent } from './attachments';
export { ExportButtons } from './export-buttons';
