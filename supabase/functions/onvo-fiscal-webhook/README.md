# Recepción de pagos de ONVO para factura electrónica

La función registra pagos confirmados de una cuenta de ONVO dedicada a ventas de
Zummith. Guarda una fila por ambiente, cuenta e intención de pago. La tabla
`onvo_fiscal_payments` conserva los registros para la futura integración con
Bonfire Factura.

## Facturación al lanzamiento

Bonfire emitirá las facturas manualmente mientras termina Bonfire Factura. Para
cada emisión manual, registrá la referencia del pago en ONVO junto con el
número de factura. Así se podrá cotejar qué pagos ya se facturaron cuando se
active la integración.

## Prueba en un proyecto de staging

1. Aplicá la migración `20261119205523_onvo_fiscal_payments.sql` y desplegá
   `onvo-fiscal-webhook` en el proyecto de staging.
2. Creá un endpoint de webhook firmado en
   [ONVO, en modo de prueba](https://docs.onvopay.com/webhooks#crear-un-endpoint).
   Usá `https://<project-ref>.supabase.co/functions/v1/onvo-fiscal-webhook` y
   seleccioná `payment_intent.succeeded` y `subscription_renewal.succeeded`.
3. Configurá `ONVO_FISCAL_MODE=test`, `ONVO_FISCAL_ACCOUNT_ID` con el
   identificador de la cuenta, `ONVO_FISCAL_SCOPE=dedicated_account` y
   `ONVO_FISCAL_SIGNING_SECRET` con el secreto de ese endpoint. El secreto se
   configura en Supabase y se mantiene fuera del repositorio.
4. Probá la conexión y un primer cobro y renovación simulados. Verificá que cada
   intención quede registrada una vez aunque ONVO vuelva a enviar el webhook. Si
   la cuenta también cobra por otros negocios o vendedores de un marketplace,
   primero implementá un filtro que identifique inequívocamente las ventas de
   Bonfire.

Para integrar Bonfire Factura se necesitan los datos fiscales del cliente, la
configuración fiscal de cada plan y una forma de consultar la factura por la
referencia de pago. Ante una respuesta incierta, consultá si el documento ya
existe antes de reenviarlo.
