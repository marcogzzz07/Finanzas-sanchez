# Finanzas familiares — Product spec y plan de implementación

Versión: 0.3 · Fecha: 10 de octubre de 2026 · Estado: propuesta para construir el MVP. Cambios de la 0.3: bandeja de estados de cuenta con lectura automática (4.6), edición explícita de conceptos e importes, identificación de las personas y referencia de diseño pendiente.

Este documento es el punto de partida para implementar la aplicación con Claude Code. Distingue necesidades expresadas, decisiones recomendadas y datos pendientes. Los valores de ejemplo son ficticios.

**Requisito transversal confirmado por Marco: toda la información operativa debe poder agregarse, editarse, cambiarse o retirarse desde la aplicación según el rol. Bancos, cuentas, tipos de recurso, responsables, categorías y calendarios son configurables. Los nombres y recursos mencionados son ejemplos iniciales, no valores fijos en el código. Esta flexibilidad forma parte del MVP.**

## 1. Objetivo

Crear una aplicación web privada para que Marco, su mamá y sus tías administren los recursos y pagos relacionados con la familia y con el cuidado de su abuela.

Al abrirla deben poder responder:

1. ¿Cuánto dinero tenemos registrado en cada cuenta y en efectivo?
2. ¿Qué ingresos y gastos hubo este mes?
3. ¿Qué hay que pagar, cuándo vence y quién se encarga?
4. ¿Dónde está el estado de cuenta o comprobante?
5. ¿El saldo registrado coincide con el estado de cuenta?

La abuela es una beneficiaria del sistema; no se presupone que deba operarlo ni tener una cuenta de usuario.

## 2. Contexto conocido

| Recurso | Tipo | Responsable mencionado |
| --- | --- | --- |
| Banorte | Cuenta bancaria | Alicia |
| Banorte crédito | Tarjeta de crédito | Alicia |
| Bancrea | Inversión | Ana; confirmar nombre |
| Efectivo | Caja de efectivo | Ana; confirmar nombre |

Esta lista no limita el número de recursos. Desde la aplicación se pueden crear otros, cambiar banco o responsable, corregir su tipo, renombrarlos y eliminarlos o archivarlos según las reglas de historial. **Banco/institución** (Banorte, Bancrea u otro) y **persona responsable** (Alicia, Ana u otra) son campos independientes.

Ingresos conocidos: rentas de departamentos e ingresos de bancos. Falta precisar si estos últimos son intereses, depósitos u otros conceptos.

Pagos conocidos: doctores, enfermeros, otros gastos de salud, agua, gas y luz de los departamentos, y predial de la casa. Se mencionaron pagos de enfermeros los sábados y domingos.

Personas confirmadas por Marco: Ana es su mamá; Alicia y Adriana son sus tías. Son tres personas distintas. Quién es mamá y quién tía no afecta el funcionamiento de la aplicación. Sus roles y usuarios se definen al final, cuando la familia decida si alguien debe tener más acceso que las demás; no crear usuarios reales hasta entonces. No equiparar responsable de una cuenta con su titular legal.

Tecnología decidida por Marco: Supabase, despliegue en Vercel e implementación con Claude Code. Este documento define el producto; no constituye una aplicación ya implementada.

## 3. Decisiones propuestas para mantener pequeño el MVP

- Una sola familia y un solo espacio compartido. No construir un SaaS ni soporte para varias familias.
- Interfaz en español, moneda MXN y fechas de calendario en `America/Monterrey`. Son valores iniciales propuestos.
- Los movimientos se registran de dos formas: a mano, o desde la bandeja de estados de cuenta (4.6), donde la aplicación lee los PDF y propone los movimientos. Subir un archivo a Documentos (4.5) sigue sin modificar saldos; solo la bandeja puede registrar movimientos, y con las salvaguardas de 4.6.
- Proponer Bancrea inicialmente como inversión, con tipo editable; sin rendimientos diarios ni valuación de mercado.
- Alertas dentro de la aplicación y correo electrónico: canal confirmado por Marco durante la planificación. WhatsApp queda fuera del MVP.
- Acceso por persona con tres roles simples. La propuesta inicial permite consultar todo el espacio familiar; validar ese nivel de visibilidad antes de cargar información real.
- Calendario sencillo mediante una agenda agrupada por fecha. La cuadrícula mensual puede esperar.
- Conciliación inicial mediante comparación manual de saldos, sin motor de coincidencia automática.
- Tesorería inicial mediante saldos registrados y lista de próximos pagos; sin pronósticos financieros.
- Mantener pequeño el número de funciones, con configuración editable desde la interfaz. No requerir cambios de código, nuevas migraciones ni acceso al panel de Supabase para administrar los datos cotidianos.

## 4. Alcance del MVP

### 4.1 Usuarios y acceso

Inicio de sesión mediante Supabase Auth, con correo y contraseña, recuperación de acceso y usuarios previamente invitados. Sin registro público ni cuentas compartidas. Configurar el envío de correos de Auth para el entorno real.

| Rol | Puede consultar | Puede registrar y corregir | Puede administrar accesos y configuración |
| --- | --- | --- | --- |
| Administrador | Todo el espacio familiar | Sí | Sí |
| Editor | Todo el espacio familiar | Sí, cuentas, catálogos operativos, movimientos, pagos y documentos | No, accesos y configuración global reservados al administrador |
| Consulta | Todo el espacio familiar | No | No |

Propuesta: Marco como administrador técnico; Ana, Alicia y Adriana como editoras, con opción de dar consulta o más acceso a quien la familia decida. Nombres, correos y roles finales pendientes; Marco los confirma al final. La responsable operativa de una cuenta es un dato informativo; no otorga permisos adicionales.

Una pantalla sencilla de administración permite invitar usuarios, cambiar su rol y desactivar o reactivar su acceso. Desactivar a una persona debe impedir nuevas lecturas, escrituras y descargas aunque conserve una sesión abierta. No permitir que se desactive o quite su rol el último administrador activo.

El catálogo editable de personas responsables es independiente de los usuarios con acceso: puede existir una responsable sin inicio de sesión. Para recibir correos de pagos, debe vincularse a un usuario activo con correo confirmado; los pagos sin ese vínculo se incluyen en el resumen global.

### 4.2 Cuentas y efectivo

Ofrecer las cuatro cuentas anteriores como ejemplos iniciales que la familia puede aceptar, modificar o eliminar. Los saldos permanecen vacíos hasta capturarlos. Cada cuenta contiene nombre, institución opcional, tipo, responsable opcional, titular/beneficiario opcional, fecha de inicio del registro, saldo inicial e indicador “Disponible para pagos”.

Desde Cuentas, administradores y editores pueden agregar recursos sin un límite fijo de cuatro, editar sus campos, cambiar institución y responsable, archivar, reactivar y eliminar cuando no tengan historial vinculado. El selector de instituciones permite agregar o modificar bancos desde esa misma pantalla.

Tipos seleccionables: cuenta bancaria, tarjeta de débito/cuenta asociada, tarjeta de crédito, efectivo e inversión. El tipo se puede cambiar desde la aplicación, incluyendo crédito → débito. Débito usa el saldo de los fondos de la cuenta asociada; crédito usa deuda. Si una tarjeta de débito y una cuenta bancaria representan los mismos fondos, se configura un solo recurso con ambos datos para evitar sumar ese dinero dos veces.

Cambiar nombre, institución o responsable conserva el identificador del recurso y sus vínculos. Si se cambia el tipo con movimientos existentes, la interfaz ofrece una corrección guiada: vista previa de saldos y resúmenes con el nuevo tipo, confirmación del saldo inicial y validación de movimientos y pagos vinculados. Los elementos incompatibles se pueden corregir, reasignar o cancelar desde esa interfaz antes de confirmar. Guardar el cambio y sus correcciones de forma atómica, registrar el autor y marcar revisiones de saldo afectadas como desactualizadas. No basta con cambiar una etiqueta mientras los cálculos siguen usando el tipo anterior.

Si el cambio corresponde a reemplazar un recurso por uno realmente nuevo, ofrecer crear el nuevo y archivar el anterior, conservando su historial. La familia puede elegir entre corregir la clasificación existente o registrar ese reemplazo.

El saldo inicial corresponde al comienzo de la fecha de inicio. Los movimientos efectivos de esa fecha en adelante se suman al saldo inicial. No capturar movimientos anteriores a la fecha de inicio ni cargar historia que ya esté incluida en el saldo de arranque. Si la familia quiere histórico (por ejemplo, lo que va del año), fija la fecha de inicio al principio de ese periodo y carga los estados de cuenta por la bandeja (4.6); la fecha y el saldo de inicio aún no están definidos y se pueden editar.

Mostrar todos los recursos activos según sus datos y tipo, por ejemplo:

- Banorte: saldo registrado.
- Efectivo: efectivo registrado.
- Bancrea: saldo de inversión registrado, sin estimación automática de rendimientos.
- Tarjeta: deuda registrada, con signo claro; un saldo a favor debe identificarse como tal.

La liquidez para pagos suma los recursos activos marcados “Disponible para pagos”. En los ejemplos iniciales serán Banorte y efectivo; Bancrea empezará excluida. La familia puede modificar esa selección para cuentas con fondos, incluidas inversiones si realmente son utilizables para pagos. Una tarjeta de crédito no aporta su límite ni su deuda al disponible. Los valores deben decir “según registros”; la aplicación no consulta al banco. Ningún cálculo depende del nombre Banorte o Bancrea.

Una cuenta con movimientos u otros vínculos se retira mediante archivo, con opción de reactivarla. Una sin vínculos puede eliminarse después de confirmar. Archivar quita el recurso de nuevas capturas y de la liquidez actual, pero conserva consulta, documentos y reportes históricos. Si tiene saldo o pendientes, mostrar su impacto antes de confirmar. Saldo inicial y fecha de inicio también son editables: exigir vista previa del efecto y resolver movimientos que quedarían fuera del nuevo período, sin ocultarlos silenciosamente.

### 4.3 Movimientos

Formularios cortos para ingreso, gasto, traspaso y devolución de gasto. Campos principales: fecha efectiva, cuenta, importe, concepto y categoría. Cuenta destino solo para traspasos. Opcionales: responsable, departamento/casa/beneficiario como etiqueta, notas y comprobante.

Categorías iniciales sugeridas: rentas, ingresos bancarios, salud, enfermería, servicios, predial, otros ingresos y otros gastos. Desde la aplicación se pueden agregar, renombrar, cambiar su aplicación a ingresos/gastos y archivar o eliminar categorías. Mantener catálogos sencillos editables de departamentos/casa y beneficiarios; no construir administración de propiedades ni expedientes médicos. Al renombrar un elemento, conservar sus vínculos por identificador.

Consultar movimientos con filtros por mes, cuenta y tipo. Ver quién creó o corrigió cada registro. Corregir registros y anular errores con una nota; no borrarlos físicamente. Adjuntar PDF, JPG o PNG opcionalmente.

Todo es editable después de guardar, también lo que vino de un estado de cuenta: el nombre y el detalle del concepto, el importe, la fecha, la cuenta, la categoría, las etiquetas y las notas. Cada edición conserva autor y fecha, y recalcula saldos y resúmenes al instante. Los conceptos y descripciones son texto libre; las categorías y etiquetas son catálogos editables.

Reglas indispensables:

| Operación | Efecto en las cuentas | Efecto en ingresos/gastos |
| --- | --- | --- |
| Renta recibida en Banorte | Aumenta Banorte | Ingreso |
| Enfermero pagado en efectivo | Disminuye efectivo | Gasto |
| Doctor pagado con tarjeta | Aumenta deuda de tarjeta | Gasto |
| Pago de tarjeta desde Banorte | Disminuye Banorte y deuda de tarjeta | Traspaso, sin nuevo gasto |
| Retiro de Banorte a efectivo | Disminuye Banorte y aumenta efectivo | Traspaso |
| Retiro de capital de Bancrea a Banorte | Disminuye Bancrea y aumenta Banorte | Traspaso |
| Interés abonado por Bancrea | Aumenta Bancrea | Ingreso capturado manualmente |
| Devolución de compra | Aumenta saldo de banco/efectivo o reduce deuda de tarjeta | Reduce gasto de su categoría |

Importes positivos en centavos; el tipo de operación determina el efecto. No usar números de punto flotante para dinero. En tarjeta, un cargo suma a la deuda y un abono la reduce. No ofrecer ingresos normales en tarjeta; usar devolución o traspaso para los casos admitidos.

Un traspaso es una sola operación con origen y destino distintos. Ambas cuentas se actualizan de forma atómica. Los totales mensuales de ingresos y gastos excluyen traspasos, saldos iniciales y registros anulados. Los reembolsos reducen gastos en el mes de su fecha efectiva.

### 4.4 Pagos pendientes y recurrentes

Crear un pago pendiente con concepto, vencimiento, responsable, importe conocido o “por confirmar”, categoría y etiqueta opcional de inmueble/beneficiario. La cuenta de pago se elige cuando se registra el pago real.

Estados: pendiente, pagado y cancelado. “Vencido” se calcula cuando un pendiente tiene fecha anterior a hoy; no se almacena como estado separado.

Recurrencias admitidas:

- Sin repetición.
- Semanal: uno o varios días de la semana; enfermeros sábado y domingo genera dos vencimientos distintos.
- Mensual: un día del mes.
- Anual: un día y mes; ejemplo, predial.

Si el día no existe en ese mes, usar el último día del mes. Cada regla tiene una fecha de inicio y puede pausarse. Para servicios variables, generar pagos con importe por confirmar o un importe expresamente identificado como estimado.

Al seleccionar “Registrar pago”, la persona indica importe real, fecha efectiva y cuenta. El sistema crea el movimiento y enlaza el pago en una sola operación. Si el gasto ya fue capturado, permitir vincular ese movimiento compatible en lugar de crear otro. Un movimiento no puede saldar dos pendientes diferentes.

Para el pago de tarjeta, crear un pendiente de tipo “pago de tarjeta”; al saldarlo registrar el traspaso a la tarjeta, sin volver a reconocer los gastos. Fecha límite e importe a pagar se capturan desde el estado de cuenta. No calcular pago mínimo ni pago para evitar intereses, ni usar toda la deuda registrada como importe exigible por defecto.

MVP sin pagos parciales ni múltiples movimientos por pendiente: cada pendiente se liquida con una operación. Si cambia el importe real, conservar el previsto y el pagado como valores distintos.

Anular un movimiento vinculado requiere confirmar que el pendiente volverá a estar pendiente. El cambio debe ser atómico. Corregir importe o fecha actualiza también el vínculo del pago. Un pendiente pagado no se cancela directamente; primero se revisa su movimiento.

Generar ocurrencias de forma idempotente para los próximos 60 días, con unicidad por regla y fecha. Recuperar vencimientos omitidos desde el último procesamiento si el trabajo estuvo detenido. La lista incluye también pagos antiguos pendientes. Cambiar o pausar una regla solo modifica ocurrencias futuras todavía pendientes; conserva pagos hechos y vencidos existentes. Las modificaciones futuras requieren una confirmación que explique qué ocurrencias se reemplazan.

Desde Pagos se pueden crear y editar conceptos, importes, responsables, fechas, cuenta/tarjeta destino si corresponde y reglas de repetición. Permitir cambiar solo un vencimiento o la serie futura, pausar/reactivar una regla y cancelar/eliminar según sus vínculos. Añadir repetición cada N días como opción sencilla para intervalos no semanales. Los sábados, domingos y días de servicios son configuración inicial editable, no reglas fijas por concepto o persona.

### 4.5 Estados de cuenta y comprobantes

Subir estados de cuenta PDF, asociados a cuenta y período, con fecha de corte opcional. Consultar y descargar el archivo. Guardar comprobantes PDF/JPG/PNG asociados a un movimiento. Límite inicial propuesto: 10 MB por archivo.

Almacenar archivos en un bucket privado de Supabase Storage. Registrar quién los subió. El nombre del archivo no será una URL pública; las descargas requieren acceso y usan enlaces temporales.

Desde Documentos se puede corregir nombre, cuenta, período y asociaciones, subir un reemplazo y retirar un documento. Si respalda un movimiento o revisión, conservar la versión asociada como historial o pedir su reasignación antes de retirarla; nunca dejar enlaces rotos. Un archivo sin vínculos se puede eliminar con confirmación. Una revisión de saldo admite corregir corte, saldo declarado, nota y evidencia, dejando rastro de la modificación.

Un archivo subido aquí no se lee ni modifica saldos. La lectura automática ocurre solo en la bandeja de estados de cuenta (4.6). En salud se registran gastos y comprobantes; no se presupone un expediente clínico.

### 4.6 Bandeja de estados de cuenta (lectura automática)

Objetivo de Marco: descargar los estados de cuenta de un periodo largo (por ejemplo, lo que va del año), subirlos todos de una vez y que la aplicación los lea, registre lo que corresponda y deje las cuentas al día. Después, cada vez que se suba un estado nuevo, continúa desde donde se quedó.

Bancos iniciales confirmados: Banorte y Bancrea, en PDF, con carga de lo que va de 2026. No son una lista fija: si falta un banco o una cuenta, se agrega desde la misma Bandeja ("Agregar banco" o "Agregar cuenta" junto al selector) o desde Cuentas, y sus estados se cargan igual. La lectura no depende de plantillas por banco escritas en el código; un banco nuevo debe poder leerse sin cambios ni redespliegue. Si la lectura de un banco nuevo falla, sus archivos quedan por revisar con captura manual de las líneas.

Flujo:

1. En **Bandeja**, administradores y editores suben uno o varios PDF y eligen la cuenta; la aplicación intenta detectar cuenta y periodo, que la persona confirma o corrige. El orden de carga no importa: se procesan por fecha de corte.
2. La aplicación lee cada archivo y extrae periodo, saldo inicial, saldo final y la lista de movimientos (fecha, concepto, importe, cargo o abono). Cada archivo muestra su estado: en cola, leído, por revisar, registrado o con error.
3. Cada línea leída se clasifica en una operación (ingreso, gasto, traspaso o devolución) con categoría sugerida. Las categorías y reglas aprendidas (por ejemplo, "este concepto siempre es renta") salen de los catálogos y de las correcciones previas; se editan desde la aplicación y no están en el código.
4. Antes de registrar, la aplicación detecta duplicados contra movimientos ya capturados (misma cuenta, fecha cercana e importe igual) y propone vincular en lugar de crear. Una línea que ya existe no vuelve a sumar. Una línea que es un traspaso entre cuentas de la familia se propone como una sola operación.
5. Las líneas aceptadas se registran como movimientos normales, con referencia al archivo origen y a la línea, para poder rastrearlos y deshacer la carga completa de un archivo.
6. Al cerrar un archivo, la aplicación hace una revisión de saldo (4.7) automática: saldo calculado a la fecha de corte contra saldo final del PDF. Si coincide, el archivo queda "Conciliado por saldo". Si no, queda "Diferencia por revisar" con el detalle y no se corrige automáticamente.

Modo de registro, configurable por cuenta desde Configuración: **con revisión** (valor inicial: la persona ve las líneas leídas, edita lo que haga falta y confirma) o **automático** (se registran solas las líneas sin duplicado ni ambigüedad, y solo se detienen las que requieren revisión). Recomendación: usar revisión en los primeros estados de cada banco y cambiar a automático cuando la lectura haya demostrado ser confiable.

Arranque sin fecha conocida (decisión de Marco): no hay fecha de inicio ni saldo inicial definidos de antemano. Una cuenta se puede crear sin ellos y queda "Sin saldo de arranque". Mientras tanto acepta movimientos manuales, pero la app no presenta su saldo como un total confiable: lo muestra como "Saldo por confirmar" y no lo suma a la liquidez. Al registrar el primer estado de cuenta de esa cuenta, la fecha de inicio pasa a ser el inicio del periodo del estado y el saldo inicial, el saldo inicial que trae el PDF; la persona lo confirma en una vista previa. Los movimientos manuales que caen dentro del periodo se proponen como duplicados de las líneas leídas; los anteriores a la fecha de inicio se muestran para decidir si se anulan o se cambia la fecha. A partir de ahí, cada estado nuevo deja la cuenta al día. Los estados de Banorte y Bancrea son PDF descargados de las aplicaciones de los bancos, no escaneados.

Continuidad: cada cuenta recuerda hasta qué fecha de corte está cubierta. Al subir un estado nuevo se comprueba que su saldo inicial coincida con el final del anterior y se avisa de huecos o traslapes de periodo. Si la cuenta aún no tiene saldo inicial, se propone tomar el del primer estado cargado, con confirmación. Esto sustituye la captura manual del saldo de arranque para el histórico.

Reglas:

- La lectura puede equivocarse. Ninguna línea con importe, fecha o signo dudoso se registra sola, aunque el modo sea automático.
- Toda línea es editable antes y después de registrarse (4.3).
- Importes en centavos y validación de que la suma de líneas explique la diferencia entre saldo inicial y final del estado; si no cuadra, el archivo queda por revisar.
- Los PDF escaneados o de mala calidad pueden fallar. Debe indicarse el error por archivo, sin bloquear los demás, y permitir reintentar o capturar a mano.
- El archivo original se conserva en el bucket privado (4.5) y queda asociado a cuenta y periodo.
- El proceso corre en el servidor; la clave del servicio de lectura no sale al navegador. El servicio de lectura recibe el contenido de los estados de cuenta: documentar cuál se usa y obtener la aprobación de Marco antes de cargar archivos reales. En desarrollo usar únicamente estados ficticios.
- Idempotencia: subir dos veces el mismo archivo no duplica movimientos (detectar por huella del archivo y por cuenta, periodo y líneas).
- Procesar en segundo plano con avance visible (por ejemplo, "8 de 12 archivos"), sin límite fijo de archivos por carga; el límite de 10 MB por archivo se puede ajustar en Configuración.
- Se admiten PDF en el MVP. Otros formatos (CSV o imágenes) quedan para después, salvo que el banco solo los ofrezca así.
- Cargas por lotes: una carga de varios meses se procesa en orden de fecha de corte y se detiene en el primer archivo que no cuadre, para no propagar un error a los meses siguientes.

### 4.7 Revisión manual de saldos

Desde el detalle de una cuenta, seleccionar una fecha de corte, escribir el saldo del documento o del conteo de efectivo, y ver el saldo calculado a esa misma fecha, incluyendo todo ese día.

- Mostrar diferencia = saldo declarado menos saldo registrado.
- Adjuntar o vincular el estado de cuenta como evidencia opcional.
- Guardar fecha, saldo declarado, saldo registrado al revisar, nota y persona que revisó.
- Si la diferencia es cero, mostrar “Saldo coincide”; si no, “Diferencia por revisar”.

Para tarjeta se compara deuda con deuda usando la convención de signo de la aplicación. Para Bancrea se compara el saldo informado, sin calcular rendimientos. No modificar el saldo inicial para hacer desaparecer diferencias ni crear ajustes automáticos.

La coincidencia de saldos no demuestra que cada movimiento esté conciliado. Usar la etiqueta “Revisión de saldo”, no “Conciliación completa”. Si cambian movimientos que afecten el corte, recalcular la diferencia y marcar la revisión anterior como desactualizada; conservar la evidencia original.

### 4.8 Inicio y tesorería básica

Una pantalla inicial debe mostrar:

- Dinero registrado para pagos: suma de los recursos activos configurados como disponibles.
- Inversiones y deudas de tarjetas en tarjetas separadas, con los nombres actuales de los recursos.
- Ingresos y gastos netos de devoluciones del mes.
- Pagos vencidos, de hoy y de los próximos siete días, con responsable.
- Total de pagos de importe conocido en ese horizonte y cantidad de importes por confirmar.
- Últimos movimientos y accesos a “Registrar ingreso”, “Registrar gasto” y “Registrar pago”.

No mostrar “saldo libre” o un pronóstico que reste obligaciones de fechas distintas. La liquidez actual y los pagos próximos son dos datos separados. El pago de tarjeta sí cuenta como obligación de tesorería, aunque no sea un segundo gasto.

### 4.9 Administración editable desde la aplicación

Este requisito debe implementarse como pantallas y acciones utilizables en el MVP, no como instrucciones para editar la base de datos.

| Elemento | Operaciones desde la interfaz |
| --- | --- |
| Instituciones/bancos | Agregar, renombrar, reasignar recursos y retirar. |
| Cuentas y tipos | Agregar, editar nombre/institución/tipo/responsable/saldo inicial/disponibilidad, archivar, reactivar y eliminar si no hay vínculos. |
| Personas responsables | Agregar, editar, vincular/desvincular usuario, reasignar responsabilidades y retirar. |
| Categorías, inmuebles y beneficiarios | Agregar, editar, reasignar registros y retirar. |
| Movimientos | Agregar, editar concepto, detalle, importe, fecha, cuenta y categoría, y anular con motivo; conservar el historial de operaciones financieras. |
| Bandeja de estados de cuenta | Subir lotes, corregir cuenta y periodo, editar o descartar líneas leídas, confirmar, deshacer la carga de un archivo y elegir modo con revisión o automático por cuenta. |
| Pagos y recurrencias | Agregar, editar, cambiar responsable/vencimiento/importe/repetición, pausar, reactivar y cancelar o eliminar según vínculos. |
| Documentos y revisiones | Agregar, editar metadatos/asociaciones, reemplazar evidencia y retirar conservando vínculos históricos. |
| Usuarios y accesos | Invitar, editar datos permitidos, cambiar rol, desactivar y reactivar; solo administrador. |
| Preferencias de avisos | Modificar hora, anticipación y destinatario global; cada usuario puede activar/desactivar sus correos. |

“Eliminar” tiene una regla común: sin historial ni referencias, permitir borrado con confirmación; con referencias, ofrecer reasignación o archivo/desactivación para conservar el historial. Movimientos se anulan y pagos realizados conservan su operación. El usuario debe resolver estas acciones desde la app y recibir una explicación concreta de su efecto, sin acudir a Claude Code ni a Supabase.

No confundir flexibilidad de datos con reglas financieras arbitrarias: los tipos tienen comportamientos de cálculo definidos, pero cada recurso puede cambiar de tipo mediante el flujo descrito. Los roles siguen siendo administrador/editor/consulta, con asignación editable. MXN es la moneda del MVP; no se agregan varias monedas mediante esta modificación.

## 5. Recordatorios

### Experiencia propuesta

Las alertas dentro de la app se calculan al abrir Inicio o Pagos. No dependen de que se haya enviado un correo.

Enviar un resumen diario por correo alrededor de las 08:00, hora de Monterrey, solo cuando existan pagos pendientes vencidos o con vencimiento dentro de los siguientes tres días. Repetir los vencidos en el resumen diario hasta registrarlos o cancelarlos. Un pago de sábado aparece desde el miércoles; uno de domingo, desde el jueves.

08:00 y tres días son valores predeterminados editables en Configuración. El trabajo usa la hora, zona horaria, anticipación y destinataria global configuradas; actualizar esos datos no requiere redespliegue. Cada resumen toma la responsable vigente del pago. Cambiar la responsable de una cuenta no reasigna automáticamente todos sus pagos; ofrecer aplicar ese cambio a pendientes futuros mediante una acción explícita.

La responsable recibe sus pagos; una administradora operativa designada recibe el resumen global y los pagos sin responsable. Marco no se convierte automáticamente en destinatario financiero por ser administrador técnico. Enviar un solo resumen por destinatario y fecha local, combinando ambos conjuntos y quitando duplicados. Permitir activar o desactivar correos por usuario.

Asunto propuesto: “Tienes pagos por revisar”. Incluir concepto y vencimiento, sin saldos bancarios, documentos médicos ni adjuntos. El enlace lleva a la aplicación y exige inicio de sesión. Las alertas no ejecutan pagos y no garantizan que un correo se haya leído.

### Implementación recomendada

Supabase Cron invoca una Edge Function que genera ocurrencias, consulta pendientes y envía el resumen mediante Resend. Se recomienda mantener este proceso junto a los datos de Supabase. Supabase documenta tanto la programación de funciones como el envío con Resend; ver las fuentes de la sección 12.

- Un trabajo horario comprueba si ya pasó la hora local de envío y si falta el resumen de ese día. No es un correo cada hora: es un disparador para enviar, como máximo, uno al día.
- Fechas de pago como `date`; auditoría como `timestamptz`; calcular hoy y ventanas de recordatorio con `America/Monterrey`, sin depender de la zona del servidor.
- Proteger la función y guardar sus secretos fuera del navegador. El trabajo debe funcionar sin visitas a la aplicación.
- Reservar cada envío con una clave única por destinatario y fecha local, usando bloqueo o reclamación atómica para evitar carreras. Antes de la primera solicitud, congelar el contenido del resumen. Los reintentos usan el mismo contenido y clave de idempotencia; Resend documenta una ventana de 24 horas para estas claves.
- Registrar pendiente, procesando, aceptado por proveedor o fallido, intentos y error. Un timeout no se trata como confirmación de entrega. No reenviar ciegamente un envío de estado ambiguo fuera de la ventana de idempotencia.
- Antes de la primera solicitud de envío, volver a comprobar pagos pendientes y usuario activo; excluir pagos ya registrados. No mandar resúmenes vacíos. Los reintentos de una solicitud ambigua conservan el contenido original para no invalidar su clave; el correo representa pendientes al momento de preparar ese resumen y la app muestra el estado actual.
- Reintentar fallos transitorios con un límite de tres intentos por resumen. Exponer el último procesamiento y fallos al administrador. No acumular y enviar correos de días pasados después de una interrupción.
- Aceptado por el proveedor no significa leído ni entregado al buzón; usar esa etiqueta en administración.
- En desarrollo y previews, desactivar envíos reales; permitir únicamente correos de prueba a destinatarios expresamente configurados.

Para producción se necesita una cuenta de Resend, API key, remitente en dominio verificado y configuración del trabajo. Si falta esa configuración, la app conserva alertas internas y muestra al administrador “Correos sin configurar”; no fingir que los recordatorios externos funcionan.

Vercel Cron sería una alternativa. En Hobby admite ejecuciones una vez al día y puede ejecutarlas dentro de la hora configurada; por eso no se promete una hora exacta ni se depende de ese mecanismo en esta propuesta. Revisar disponibilidad y límites de los planes contratados al desplegar; no asumir servicio gratuito ni funcionamiento continuo si el proyecto está pausado.

## 6. Navegación y diseño

Referencia visual: Marco entregará la referencia de UX/UI cuando se le pida, antes de construir pantallas. Hasta entonces no se define el estilo visual; solo se construye estructura y funcionamiento con un aspecto neutro.

Seis secciones principales: **Inicio, Movimientos, Pagos, Cuentas, Documentos y Bandeja**. Desde el perfil, abrir **Configuración** con catálogos operativos, responsables, preferencias y administración de accesos según rol. Agregar/editar debe estar también disponible junto al selector correspondiente, para no interrumpir una captura.

- Diseñar primero para celular y usar formularios de una columna.
- Texto legible, botones amplios y acciones con verbos cotidianos.
- Etiquetas como “Dinero en cuenta”, “Deuda de tarjeta” y “Por pagar”.
- Estados con texto además del color; confirmar importes y cuenta antes de guardar un pago.
- Mostrar estado vacío útil: “Todavía no hay movimientos. Registra el primero”.
- Al guardar, mantener el registro visible; impedir envíos dobles y mostrar errores sin perder el formulario.
- Calendario inicial como agenda por fecha, con filtros por responsable y estado.
- No agregar gráficos de inversiones, asistentes de IA ni paneles contables complejos.

## 7. Modelo de datos orientativo

Claude Code puede ajustar nombres y detalles manteniendo las reglas de negocio. Basta un espacio familiar fijo; no agregar arquitectura multiempresa.

| Tabla | Propósito y datos principales |
| --- | --- |
| `profiles` | Usuario de Auth, nombre, rol, activo, preferencia de correo. La dirección de envío procede de Auth y solo la consulta el servidor. |
| `family_settings` | Configuración única editable: zona horaria, moneda MXN, hora de resumen, días de anticipación y destinataria global. |
| `institutions` | Catálogo editable de bancos/instituciones, nombre y estado activo/archivado. |
| `responsible_people` | Persona responsable, nombre, usuario vinculado opcional y estado; independiente del banco y de tener acceso. |
| `categories` | Nombre, uso en ingresos/gastos y estado activo/archivado. |
| `reference_labels` | Catálogo sencillo de inmuebles y beneficiarios, nombre, clase y estado. |
| `accounts` | Nombre, institución, tipo editable, responsable, titular/beneficiario, fecha y saldo inicial en centavos, disponible para pagos, archivada. |
| `transactions` | Tipo, cuenta origen, destino opcional, importe en centavos, fecha efectiva, categoría, concepto, etiquetas, estado activo/anulado, motivo y auditoría. |
| `recurrence_rules` | Concepto, categoría, tipo de pago, responsable, importe opcional/estimado, frecuencia, días, inicio y activa. |
| `payment_occurrences` | Regla opcional, concepto, tipo de pago, vencimiento, responsable, importe previsto/estimado, estado y movimiento vinculado único. |
| `documents` | Ruta privada, tipo, cuenta/período o movimiento, fecha de corte opcional y autor. |
| `statement_imports` | Archivo de la bandeja: documento, cuenta, periodo, huella del archivo, saldo inicial y final leídos, estado (en cola, leído, por revisar, registrado, error), modo usado, resultado de la revisión de saldo y autor. |
| `statement_lines` | Línea leída: importación, fecha, concepto original y editado, importe en centavos, signo, operación y categoría sugeridas, estado (propuesta, aceptada, descartada, duplicada), movimiento vinculado y motivo de duda. |
| `balance_reviews` | Cuenta, corte, saldo declarado, saldo registrado observado, nota, documento opcional, autor y marca de revisión desactualizada. |
| `email_deliveries` | Destinatario, fecha local, contenido del resumen, clave única, estado, intentos, identificador del proveedor y error. |

Usar claves foráneas, restricciones de importe, tipos de cuenta compatibles y unicidad para recurrencias y vínculos de pagos. Calcular saldos desde saldo inicial y movimientos; no mantener un segundo saldo editable. Guardar saldo observado en revisiones como evidencia, sin convertirlo en saldo de la cuenta.

Referenciar instituciones, responsables, categorías y etiquetas por identificadores estables, no por su nombre. Las pantallas, filtros, formularios, resúmenes y correos consultan esos catálogos: no codificar una lista fija de bancos, cuentas, personas, categorías o propiedades. Definir comportamientos financieros por tipo, nunca mediante comparaciones con nombres. Las correcciones de tipo afectan los cálculos y validan todo el historial vinculado antes de guardar.

Movimientos y operaciones de pago necesitan `created_by`, `created_at`, `updated_by` y `updated_at`. El MVP necesita trazabilidad básica, no un sistema de auditoría contable completo. Validar reglas en servidor/base de datos además del formulario, incluidas transiciones de estado e idempotencia al registrar pagos.

## 8. Arquitectura y acceso a datos

- Propuesta de frontend: Next.js con TypeScript; Vercel aloja la aplicación. Usar versiones estables compatibles en el momento de implementar.
- Supabase: Auth, Postgres, Storage privado, Cron y una Edge Function para recordatorios.
- Resend: envío de resúmenes; no es un nuevo backend para la aplicación.
- Migraciones versionadas, archivo de variables de ejemplo sin secretos e instrucciones de configuración reproducibles.
- Activar RLS y permisos explícitos en tablas expuestas; exigir pertenencia activa a esta familia y rol adecuado. Una sesión autenticada por sí sola no da acceso.
- Un usuario no administrador no puede asignarse su rol ni activar su membresía. Perfil editable solo en campos personales permitidos. Accesos y roles se administran desde la interfaz mediante operación protegida para administradores, conservando al menos uno activo.
- Proteger también Storage, vistas, funciones y endpoints. Consulta no puede escribir aunque llame directamente a la API. Las funciones con privilegios verifican pertenencia y rol salvo el trabajo interno autenticado.
- Claves secretas de Supabase, Resend y del trabajo solo en servidor o secretos de funciones. No usar una clave privilegiada para el CRUD cotidiano desde el navegador.
- Verificar archivos por tamaño y tipo. Revisar acceso activo al emitir enlaces de descarga, con vigencia corta; un enlace ya emitido puede funcionar hasta su expiración.
- Preparar datos ficticios y pruebas separadas; previews no deben apuntar automáticamente a los datos reales.

No se almacenan contraseñas bancarias, CVV ni números completos de tarjeta. No son necesarios para las funciones definidas.

## 9. Fuera del MVP

- Conexión a bancos, consulta de saldos en vivo o ejecución de pagos.
- Importación de CSV o de otros formatos distintos de PDF, y conciliación completa por movimiento más allá de la revisión de saldo y la detección de duplicados de la bandeja. (La lectura de PDF y de estados escaneados con el servicio elegido sí entra, según 4.6.)
- Rendimientos diarios, recomendaciones de inversión o valuación de portafolio.
- WhatsApp, SMS, push, apps nativas y sincronización con calendarios externos.
- Permisos diferentes por cuenta o documento y varios espacios familiares.
- Cobranza a inquilinos, contratos, recibos fiscales, contabilidad fiscal y facturación.
- Pagos parciales, monedas adicionales, presupuestos y proyecciones.
- Historia clínica o gestión de citas médicas.

Si se necesita ocultar ciertas cuentas a alguna persona, los permisos por cuenta pasan a ser requisito antes del uso real; no resolverlo escondiendo secciones solo en la interfaz.

## 10. Plan general

### Paso 0 — Preparación

Confirmar usuarios y visibilidad; identificar saldos de arranque, responsables, departamentos y vencimientos reales. Reunir los correos de las destinatarias. Configurar los proyectos e integraciones. Se puede desarrollar con supuestos y datos ficticios mientras se obtiene esta información.

### Paso 1 — Construir el MVP en incrementos

1. **Base:** proyecto, Auth, membresías, roles, administración de usuarios en la app, migraciones y políticas de datos/archivos. Crear catálogos editables y ofrecer ejemplos sin saldos reales inventados.
2. **Dinero:** administración de cuentas y recursos, cambios de institución/tipo/responsable, movimientos, traspasos, devoluciones y resumen de saldos. Verificar específicamente tarjeta, débito, efectivo y cambios de configuración.
3. **Pendientes:** pagos únicos, agenda, registro/vínculo de pago y recurrencias. Primero probar enfermeros sábado/domingo y un servicio mensual.
4. **Documentos y revisión:** archivos privados y comparación manual de saldos a fecha de corte.
5. **Bandeja de estados de cuenta:** carga por lotes, lectura, líneas propuestas, detección de duplicados, modo con revisión y automático, continuidad por cuenta y revisión de saldo automática. Probar primero con estados ficticios de una cuenta bancaria y una tarjeta, y solo después con archivos reales y la aprobación de Marco.
6. **Avisos y puesta en uso:** tarea programada, resumen de correo, observabilidad mínima, validación en celular y despliegue.

Cada incremento debe funcionar antes de pasar al siguiente. Los seis forman el MVP definido aquí. Sin credenciales externas se entrega y verifica lo posible, documentando qué integración permanece sin comprobar.

### Paso 2 — Piloto familiar

Usar una semana real: una renta, un gasto médico, pagos de enfermeros, un servicio, un pago de tarjeta y un estado de cuenta. Revisar el uso con mamá y al menos una tía. Ajustar nombres, campos y navegación antes de ampliar funciones.

Éxito inicial: capturan esas operaciones sin ayuda de Marco, identifican pendientes y responsables, encuentran documentos y explican los saldos registrados. Como meta de diseño, un gasto simple debería registrarse en menos de un minuto; validar en el piloto.

### Paso 3 — Evolución según uso

Primero considerar exportación CSV, filtro de gastos por inmueble/beneficiario y calendario mensual. Después, si ahorra trabajo demostrado, importación CSV bancaria con revisión de duplicados y conciliación por movimientos. Evaluar WhatsApp u otros formatos de entrada solo si el piloto muestra que son necesarios. Cada ampliación requiere un alcance propio; no implementarla por adelantado.

## 11. Criterios de aceptación

Claude Code debe convertir estos escenarios en verificaciones proporcionadas, especialmente dinero, autorización y recordatorios.

1. Una persona invitada inicia sesión. Una no autorizada no accede a datos ni archivos. Consulta no puede escribir; editor no puede modificar roles ni configuración global, pero sí cuentas y catálogos operativos.
2. Con Banorte inicial de $10,000 y efectivo de $2,000, una renta de $5,000 deja Banorte en $15,000; un pago en efectivo de $500 deja efectivo en $1,500.
3. Con deuda inicial cero, un gasto de doctor de $1,000 en tarjeta deja deuda de $1,000. Pagarla desde Banorte reduce Banorte a $14,000 y deuda a cero. Los gastos acumulados del ejemplo son $1,500, no $2,500; los ingresos son $5,000.
4. Un retiro de Banorte a efectivo por $1,000 conserva la liquidez total y no agrega ingresos ni gastos. Una devolución de doctor de $200 en tarjeta reduce el gasto y la deuda en $200; si ya no había deuda, muestra saldo a favor.
5. Un pendiente con importe por confirmar aparece en agenda y avisos, pero no como importe cero dentro de la suma de obligaciones.
6. Una regla de enfermeros en sábado y domingo genera dos pagos por fin de semana. Reprocesar no los duplica. Día 31 mensual y 29 de febrero anual usan el último día cuando corresponde.
7. Registrar un pago crea una sola operación y lo marca pagado. Dos clics o peticiones concurrentes no duplican el movimiento. Vincular un gasto existente no cambia saldos otra vez.
8. Anular un movimiento pagador restaura el pendiente y revierte su efecto en saldos. Pausar una recurrencia conserva el historial y los vencidos existentes.
9. Subir un estado de cuenta a Documentos permite consultarlo y descargarlo con acceso autorizado. No genera movimientos, ni altera balances, ni produce una URL permanente pública.
10. Comparar saldo registrado de $14,000 con declarado de $14,200 muestra diferencia de $200, sin corrección automática. Cambiar un movimiento anterior al corte marca la revisión como desactualizada.
11. Con la configuración de ejemplo, la liquidez incluye solo Banorte y efectivo; inversión y tarjeta se muestran aparte. Las obligaciones de tarjeta aparecen en pagos próximos sin duplicar gastos. Otras cuentas marcadas disponibles también se incorporan al indicador.
12. Con correo configurado, un pago próximo aparece en un resumen aunque nadie abra la app. Un pago pagado o cancelado no aparece; una responsable recibe solo sus avisos y la destinataria global su resumen. Sin pendientes no se envía correo.
13. Reejecutar el trabajo o simular concurrencia/fallo de envío no genera resúmenes duplicados por destinatario y fecha. El panel distingue aceptado por proveedor de fallido. La zona horaria local determina la fecha y ventana.
14. El flujo principal funciona en celular: Inicio → Registrar gasto → Guardar, y Pagos → Registrar pago → Guardar. Errores conservan datos; consulta ve acciones acordes a su rol.
15. Desde la aplicación, un editor agrega un banco distinto, crea una quinta cuenta y cambia su institución y responsable. Los nuevos valores aparecen en capturas, filtros, resúmenes y documentos sin cambios de código ni despliegue.
16. Se cambia una tarjeta de crédito sin historial a débito y la interfaz pasa de deuda a fondos disponibles. Con historial, se muestra el efecto del cambio, se resuelven incompatibilidades en la app y se guardan las correcciones de forma atómica; los cálculos usan el nuevo tipo y las revisiones afectadas se desactualizan.
17. Agregar o renombrar una categoría conserva sus movimientos y actualiza los selectores. Retirar un banco/categoría/responsable con vínculos ofrece reasignar o archivar; uno sin vínculos se puede eliminar. Archivar y reactivar un recurso conserva su historial.
18. Cambiar “Disponible para pagos” actualiza la liquidez por configuración, sin depender del nombre del banco. Un límite de crédito no se vuelve dinero disponible por marcar un campo. Cuenta y débito asociados a los mismos fondos no se suman dos veces.
19. Desde la app se edita un vencimiento individual o la serie futura, se cambia su responsable y se configura cada N días. Los pagos realizados y vencidos existentes conservan su historial.
20. Un administrador invita y desactiva usuarios desde Configuración, cambia roles y edita hora/anticipación/destinataria de los avisos. Los cambios se aplican sin redesplegar y no permiten quitar el último administrador. Un editor administra catálogos operativos, pero no accesos ni ajustes globales.
21. Se suben de una vez varios estados de cuenta ficticios de meses consecutivos de una misma cuenta, en desorden. Se procesan por fecha de corte, cada línea aceptada crea un movimiento, y el saldo calculado a cada corte coincide con el saldo final de su estado.
22. Subir otra vez el mismo archivo, o un estado que repite movimientos ya capturados a mano, no duplica movimientos ni cambia saldos. Una línea dudosa (importe ilegible, signo incierto) no se registra sola ni en modo automático.
23. Un estado cuyo saldo inicial no coincide con el final del anterior, o cuyas líneas no explican su diferencia de saldos, queda "por revisar", detiene el lote y no se corrige automáticamente. Un archivo con error no bloquea a los demás.
24. Desde la app se edita el concepto, detalle e importe de un movimiento, tanto capturado a mano como leído de un estado. Los saldos y resúmenes se recalculan, queda registrado quién lo cambió y, si el movimiento afecta un corte ya revisado, esa revisión se marca desactualizada.
25. Se deshace la carga de un archivo de la bandeja: sus movimientos se anulan con motivo, los saldos vuelven a su valor anterior y las ediciones hechas a mano en otros movimientos se conservan.
26. Desde la Bandeja, sin salir del flujo de carga, se agrega un banco y una cuenta que no existían, y sus estados de cuenta ficticios se leen y registran sin cambios de código ni despliegue.

## 12. Fuentes técnicas

Documentación oficial consultada al preparar esta versión; revisar cambios y límites del plan al implementar.

- [Supabase Cron](https://supabase.com/docs/guides/cron): programación de tareas y posibilidad de invocar una Edge Function.
- [Supabase: envío de correos con Resend](https://supabase.com/docs/guides/functions/examples/send-emails): integración y requisitos de API key y dominio.
- [Resend: dominios verificados](https://resend.com/docs/dashboard/domains/introduction): configuración del dominio remitente.
- [Resend: claves de idempotencia](https://resend.com/docs/dashboard/emails/idempotency-keys): evitar solicitudes de envío duplicadas dentro de la ventana de 24 horas.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): políticas y permisos de acceso en la base de datos.
- [Vercel: administración de Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs): restricciones de frecuencia y precisión en Hobby.

## 13. Datos pendientes antes del piloto

- Personas confirmadas: Ana (mamá), Alicia y Adriana (tías). Pendiente: confirmar si Ana es la responsable de Bancrea y efectivo, qué responsabilidad tiene Adriana, y la lista final de usuarios, correos y roles (Marco los define al final).
- Visibilidad compartida o necesidad de ocultar cuentas, y si alguien debe tener más acceso que las demás.
- Estados de cuenta, confirmado por Marco: los bancos iniciales son Banorte y Bancrea, entregan PDF y se cargará lo que va de 2026. Ningún PDF es escaneado. No hay fecha de inicio por cuenta: la define el primer estado de cuenta cargado (4.6). Marco aún debe pedir los estados a la familia.
- Servicio de lectura de PDF: elegir cuál usar y obtener la aprobación de Marco para enviarle estados reales, que contienen información financiera sensible.
- Modo inicial de la bandeja por cuenta (con revisión o automático).
- Referencia de UX/UI: Marco la entrega cuando se le pida, antes de construir pantallas.
- Titulares/beneficiarios y si existen fondos personales que no deban mezclarse en el resumen familiar.
- Saldos y fecha de inicio de cada cuenta; importe y fecha límite reales de tarjeta.
- Correos de destinatarias y responsable del resumen global. El canal ya está confirmado: aplicación y correo.
- Importe, inicio y responsable de enfermeros; días de servicios y predial. Todos se configuran y pueden cambiarse desde la aplicación, incluidos intervalos cada N días.
- Departamentos/casa a identificar y qué significa “ingresos de bancos”.
- Confirmar que “registros de salud” significa gastos y comprobantes; una necesidad clínica sería otro alcance.

Estos datos no impiden construir y probar con ejemplos ficticios. Sí deben resolverse para configurar el uso real sin asumir permisos, saldos ni obligaciones.

## 14. Instrucción inicial para Claude Code

> Lee este product spec y úsalo como alcance del proyecto. Implementa únicamente el MVP con Next.js y TypeScript, Supabase y Vercel; empieza por el incremento 1 del plan, sin agregar funciones futuras. La flexibilidad administrativa es requisito del MVP: bancos, cuentas, tipos de recurso, responsables, categorías, inmuebles, beneficiarios, pagos y avisos deben administrarse desde la aplicación con acciones de agregar, editar, cambiar y eliminar/archivar según sus vínculos. No fijes Banorte, Bancrea, Alicia, Ana ni las cuatro cuentas en el código, y no sustituyas estas pantallas por instrucciones de editar Supabase. Implementa el cambio crédito/débito con efecto real en cálculos y revisión del historial, además de asignación editable de roles por administradores. Incluye la bandeja de estados de cuenta (4.6) como incremento 5, con revisión humana por defecto, detección de duplicados y revisión de saldo; no envíes estados reales a ningún servicio externo sin la aprobación de Marco. Pídele la referencia de UX/UI antes de construir pantallas. Antes de editar, revisa el repositorio y sus instrucciones y resume brevemente cómo vas a organizar la implementación. Mantén los supuestos marcados y utiliza datos ficticios hasta que se proporcionen los datos familiares. Entrega código funcional, migraciones y políticas de autorización, pruebas centradas en las reglas de dinero, flexibilidad y acceso, variables de entorno de ejemplo e instrucciones de ejecución y despliegue. Continúa con los incrementos en orden y verifica cada uno. Nunca declares una integración desplegada o probada si falta configuración o no se verificó. No envíes correos a familiares durante desarrollo; documenta las credenciales o decisiones que falten. Este documento autoriza construir el MVP, no ampliar el alcance ni usar secretos inexistentes.
