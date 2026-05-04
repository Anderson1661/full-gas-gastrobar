-- =============================================
-- SETTINGS OPERATIVOS PARA POS
-- =============================================

INSERT IGNORE INTO system_settings (key_name, value, description) VALUES
  ('business_name', 'Full Gas Gastrobar', 'Nombre comercial mostrado en comprobantes y encabezados'),
  ('business_address', '', 'Direccion principal del negocio'),
  ('business_phone', '', 'Telefono principal del negocio'),
  ('service_charge_pct', '5', 'Porcentaje configurable de servicio'),
  ('strict_stock_control', 'true', 'Bloquear ventas cuando no hay stock suficiente'),
  ('receipt_prefix', 'FG', 'Prefijo del consecutivo de comprobantes'),
  ('currency_symbol', '$', 'Simbolo de moneda mostrado en UI y comprobantes'),
  ('low_stock_alert', '5', 'Umbral visual para alertas de bajo stock'),
  ('print_bar_ticket', 'true', 'Imprimir comanda al enviar items a barra');
