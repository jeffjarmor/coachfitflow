import { ZUMMITH_CONTACT } from '../../core/config/contact';

interface LegalSection {
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly entries?: readonly { title: string; description: string }[];
  readonly link?: { label: string; href: string };
  readonly anchor?: 'cookies';
}

interface LegalDocument {
  readonly title: string;
  readonly introduction: string;
  readonly effectiveDate: string;
  readonly sections: readonly LegalSection[];
}

const operatorAddress = 'Heredia, cantón de Heredia, distrito central, Edificio Ramírez, oficina 3, diagonal a los Tribunales de Justicia, Costa Rica';
const supportChannel = `la cuenta ${ZUMMITH_CONTACT.instagramHandle} en Instagram`;

export const termsOfService: LegalDocument = {
  title: 'Términos del servicio',
  introduction: 'Conocé las condiciones para usar Zummith, gestionar tu cuenta y contratar un plan.',
  effectiveDate: 'Vigencia 25 de noviembre de 2026 · Versión [número]',
  sections: [
    {
      title: 'Quién presta el servicio',
      paragraphs: [
        `Zummith es operado por Bonfire Technologies, con cédula jurídica 3101889863 y domicilio en ${operatorAddress}. Podés contactar a Bonfire en ${ZUMMITH_CONTACT.email} o al teléfono ${ZUMMITH_CONTACT.phone}. Para consultas sobre el servicio o reclamos por cobros, enviá un mensaje directo a ${supportChannel}. Podés abrir la cuenta desde el enlace Soporte en el pie de página.`
      ]
    },
    {
      title: 'Qué podés hacer en Zummith',
      paragraphs: [
        'Zummith ofrece herramientas para que entrenadores y gimnasios gestionen clientes, rutinas, mediciones y pagos. Si tenés acceso al portal como cliente, podés consultar la información que tu entrenador o gimnasio habilite para vos.',
        'Tu entrenador o gimnasio define las rutinas y las condiciones de sus servicios. Para consultar un pago de membresía registrado en el portal, contactá al gimnasio que lo registró. Para consultar un cobro de tu suscripción a Zummith, contactanos por el canal de soporte.',
        'El seguimiento mediante mediciones es opcional. Desde Mi perfil → Permiso para mediciones podés consultar o retirar tu autorización. Si sos mayor de edad, también podés darla desde el portal cuando tu fecha de nacimiento esté confirmada. Si sos menor, tu representante legal debe autorizarlo por escrito con tu entrenador o gimnasio. Podés seguir consultando tus rutinas sin activar ese permiso.'
      ]
    },
    {
      title: 'Tu cuenta y el contenido que compartís',
      paragraphs: [
        'Mantené tus datos al día, protegé tus credenciales y avisá a soporte si detectás un acceso que no reconocés. Si administrás un gimnasio, asigná a cada persona los permisos necesarios para su función. Si registrás datos de clientes, informales cómo se van a usar y obtené la autorización que corresponda.',
        'Conservás los derechos que tengas sobre las rutinas, ejercicios y materiales que cargás. Al subirlos, autorizás a Zummith a alojarlos y mostrarlos a las personas habilitadas en la medida necesaria para prestar el servicio. Compartí únicamente materiales y datos que estés autorizado a usar.'
      ]
    },
    {
      title: 'Planes y cobros',
      paragraphs: [
        `El plan Estándar está dirigido a entrenadores independientes. Pro agrega funciones para el seguimiento del entrenamiento y el portal de clientes. Gym permite gestionar un gimnasio con varios usuarios y permisos por rol. Para consultar la disponibilidad, las funciones y las condiciones de contratación de cada plan, escribinos a ${supportChannel}.`,
        'Cuando un plan esté disponible para contratación en línea, antes de confirmar vas a poder revisar el precio total y su desglose, la moneda, la fecha del primer cobro, la frecuencia y las condiciones de renovación. Si confirmás una suscripción con renovación automática, autorizás los cobros recurrentes conforme a esas condiciones. El acceso al plan de pago se activa al confirmarse el pago.',
        `En Perfil → Facturación podés consultar la fecha, el período, el monto y el estado de los cobros de Pro. Si la notificación está habilitada, ONVO puede enviarte por correo una confirmación de cada renovación pagada. [Verificar el envío de las notificaciones de renovación en producción y confirmar cómo se entrega el comprobante del primer cobro.]`,
        `Bonfire Technologies emite manualmente la factura electrónica de tu suscripción cuando corresponda. Si necesitás el comprobante de pago o tenés una consulta sobre tu factura, escribinos a ${supportChannel}. [Confirmar el canal de entrega de la factura electrónica.]`,
        'Si un cobro de Pro falla o queda pendiente, podés ver su estado en Facturación. Desde ahí podés verificar el pago y, cuando esté disponible, actualizar tu método de pago. [Confirmar si habrá reintentos automáticos y con qué frecuencia.]',
        'Si vence el período pagado sin que se confirme la renovación, se pausan las funciones Pro y el acceso al portal para tus clientes hasta que se confirme el pago.'
      ]
    },
    {
      title: 'Cancelación, devoluciones y retracto',
      paragraphs: [
        'Si contrataste Pro con renovación automática, entrá a Perfil → Facturación → Administrar suscripción y seleccioná Cancelar suscripción. Una vez confirmada la cancelación, se detienen los cobros de renovación y conservás el acceso a Pro hasta la fecha que se muestra en Facturación.',
        'Cuando termina el período pagado, podés seguir usando las funciones del plan Estándar y consultar tus fichas de clientes, rutinas y mediciones. Las funciones exclusivas de Pro y el acceso de tus clientes a tu portal quedan pausados.',
        `Para solicitar la cancelación del plan Gym, escribinos a ${supportChannel}. Una vez confirmada, se detienen los cobros de renovación y conservás el acceso a Gym hasta que termine el período pagado. Los cobros pendientes se gestionan con las mismas condiciones que en Pro.`,
        'Si te corresponde el derecho de retracto, podés ejercerlo dentro de los 8 días hábiles siguientes a que recibamos tu aceptación de la contratación. En compras en línea, presentá la solicitud por el mismo medio que usaste para aceptar la contratación. Si contrataste Pro en Zummith, entrá a Perfil → Facturación → Retracto de Pro, seleccioná Solicitar retracto y confirmá el envío. Ahí podés consultar el número, la fecha de recepción y el estado de tu solicitud.',
        'El equipo de soporte revisa y resuelve las solicitudes de retracto. Si el retracto procede, reintegraremos el monto que corresponda por el medio de pago original dentro de los 8 días naturales contados desde el día siguiente a la recepción de tu solicitud. Para servicios pactados por períodos, el reintegro corresponde a la parte del servicio que aún no se había prestado al recibir la solicitud.',
        'Fuera del retracto, si te cobramos dos veces por el mismo período de Pro o Gym, te devolvemos el cobro adicional. Si el monto supera el precio acordado, te devolvemos la diferencia. Reintegramos el importe completo si la renovación se cobró después de confirmar la cancelación o si verificamos que el cobro no fue autorizado.',
        'Si el pago se confirma y el plan no se activa dentro del plazo ofrecido, te devolvemos el importe completo sin deducciones. Si una falla de Zummith te impide usar el plan o una función esencial, soporte evaluará el alcance y la duración de la falla para determinar si corresponde un reintegro total o parcial, según los derechos que te correspondan.',
        'Cuando el cobro es válido y el servicio estuvo disponible, dejar de usar la app u olvidar cancelar no genera una devolución automática.',
        `Para solicitar una devolución fuera del retracto o reportar un cobro que no reconocés, escribile a soporte por mensaje directo a ${supportChannel}. Indicá la fecha y la referencia del pago. Soporte revisará con prioridad los cobros que no reconozcás y te comunicará la decisión o el estado de la revisión dentro de los 3 días hábiles siguientes a la recepción de tu solicitud. Si se aprueba la devolución, tramitaremos el reintegro dentro de los 5 días hábiles siguientes a la aprobación, por el medio de pago original.`
      ]
    },
    {
      title: 'Cierre de cuenta y cambios en los Términos',
      paragraphs: [
        `Para solicitar el cierre de tu cuenta, escribinos a ${supportChannel}. Te indicaremos cuándo termina el acceso, cómo solicitar una copia de tus datos cuando corresponda y qué ocurre con las fichas compartidas y los registros que deban conservarse. El Aviso de privacidad explica cómo gestionamos esos datos.`,
        'Si cambian estos Términos, publicaremos la versión actualizada. Te avisaremos de los cambios relevantes mediante una ventana emergente en Zummith al menos una semana antes de que entren en vigor.'
      ]
    }
  ]
};

export const privacyNotice: LegalDocument = {
  title: 'Aviso de privacidad',
  introduction: 'Conocé qué datos maneja Zummith, para qué se usan y cómo podés ejercer tus derechos.',
  effectiveDate: 'Vigencia [fecha] · Versión [número]',
  sections: [
    {
      title: 'Quién maneja tus datos',
      paragraphs: [
        `Bonfire Technologies opera Zummith y administra los datos de las cuentas, el acceso, el soporte y el plan que usás en la plataforma. Su cédula jurídica es 3101889863 y su domicilio está en ${operatorAddress}. El correo de contacto de Bonfire es ${ZUMMITH_CONTACT.email}. Para consultas sobre estos datos, enviá un mensaje directo a ${supportChannel}. Podés abrir la cuenta desde el enlace Soporte en el pie de página.`,
        'Si un entrenador independiente creó tu ficha, ese entrenador la gestiona en Zummith. Si tu ficha está vinculada a un gimnasio, la gestiona el personal autorizado según sus permisos. En el portal podés ver el nombre del entrenador o gimnasio al que podés acudir por consultas sobre tu ficha.'
      ]
    },
    {
      title: 'Qué datos usamos y para qué',
      paragraphs: [
        'Para crear una cuenta por correo necesitás ingresar nombre, correo y contraseña. La ficha de cliente incluye la fecha de nacimiento.',
        'Un entrenador o gimnasio puede crear una ficha de entrenamiento para una persona menor de edad con la autorización previa y por escrito de su representante legal. Antes de crear la ficha, el entrenador o gimnasio debe explicarle qué datos se registrarán, para qué se usarán y quién podrá consultarlos. El entrenador o gimnasio obtiene y conserva la autorización fuera de Zummith, en papel o por correo electrónico.'
      ],
      entries: [
        {
          title: 'Cuenta y acceso',
          description: 'Usamos tu nombre, correo y datos de autenticación para crear tu cuenta, darte acceso y ayudarte a recuperarlo. Registramos la fecha y hora de inicio de sesión para administrar el acceso.'
        },
        {
          title: 'Ficha y entrenamiento',
          description: 'Vos, tu entrenador o tu gimnasio pueden aportar datos de contacto, fecha de nacimiento, objetivos y notas de entrenamiento. Estos datos se usan para organizar tus rutinas y consultar el progreso según los permisos del portal. En las notas, usá indicaciones prácticas como «usar una variante sin saltos». Evitá incluir diagnósticos, lesiones, medicamentos o documentos médicos.'
        },
        {
          title: 'Mediciones de progreso',
          description: 'Podés autorizar que se guarden mediciones como peso, altura, porcentaje de grasa corporal y masa muscular para dar seguimiento a tu entrenamiento. Podés consultarlas con tu entrenador o con el personal autorizado de tu gimnasio. Las rutinas siguen disponibles aunque no autoricés guardar mediciones. Si sos menor de edad, la autorización escrita de tu representante debe cubrir las mediciones y el entrenador o gimnasio deja constancia en Zummith.'
        },
        {
          title: 'Membresías y pagos',
          description: 'Usamos los datos del plan, las referencias y el estado de los pagos para administrar suscripciones, mostrar el historial de facturación y atender consultas. Cuando el trámite de retracto de Pro esté disponible en la app, se registrarán la suscripción, la fecha de recepción, el estado y la respuesta a la solicitud. En el portal, podés consultar los pagos que registra tu gimnasio.'
        },
        {
          title: 'Soporte',
          description: 'Usamos los datos de contacto y la información que nos enviás para atender tu consulta y dar seguimiento a tu solicitud.'
        }
      ]
    },
    {
      title: 'Quién puede acceder',
      paragraphs: [
        'El acceso depende del rol y los permisos de cada persona. Tu entrenador, el personal autorizado de tu gimnasio y el equipo autorizado de Zummith pueden consultar los datos necesarios para sus funciones.',
        'Algunos de los proveedores que usamos para prestar el servicio pueden procesar datos fuera de Costa Rica.',
        'Netlify aloja el sitio web con infraestructura en Estados Unidos y lo distribuye mediante una red global. Supabase gestiona la autenticación y almacena datos como perfiles, fichas, rutinas y mediciones, así como archivos como los logos. La base de datos principal de Zummith se aloja en Virginia del Norte, Estados Unidos (región us-east-1).',
        'Usamos tu dirección de correo electrónico para confirmar tu cuenta, recuperar el acceso y enviarte invitaciones al portal. Supabase Auth gestiona estos envíos y Resend entrega los mensajes. Resend almacena el contenido de los correos y los registros de entrega en Estados Unidos.',
        'Si elegís iniciar sesión con Google, solicitamos acceso a tu correo y perfil básico. Cuando se crea tu perfil en Zummith, usamos el nombre y el correo asociados a ese inicio de sesión y vinculamos el perfil al identificador de tu cuenta de Supabase. Google puede procesar información en distintos países.',
        'Si tu suscripción se procesa mediante ONVO Pay, ingresás la tarjeta en su formulario. Zummith recibe referencias y estados del pago y, cuando corresponda, datos limitados del método de pago, como la marca y los últimos cuatro dígitos.'
      ],
      link: { label: 'Política de privacidad de ONVO Pay', href: 'https://www.onvopay.com/policies' }
    },
    {
      title: 'Cuánto tiempo conservamos los datos',
      paragraphs: [
        `Si querés cerrar tu cuenta, solicitá el cierre por mensaje directo a ${supportChannel}. Cuando Bonfire completa el cierre, elimina de los sistemas activos de Zummith los datos asociados exclusivamente a tu cuenta, incluidos tu perfil, fichas, rutinas, mediciones, archivos y registros de acceso. Los registros que Bonfire deba conservar por ley, como los comprobantes fiscales, se guardan durante el plazo aplicable.`,
        'Después del cierre, los datos eliminados pueden permanecer en copias de respaldo durante un máximo de 30 días.',
        'Si sos entrenador y salís del equipo de un gimnasio, se elimina tu vínculo con ese gimnasio. Tu cuenta, tus otras afiliaciones y las fichas del gimnasio se conservan. Si un gimnasio retira a un cliente, pueden eliminarse las rutinas y mediciones de esa membresía. La ficha general y otros vínculos del cliente pueden conservarse.',
        'El equipo de soporte resuelve las solicitudes de retracto. Conservamos el registro de la solicitud y su resolución durante 30 días a partir de la fecha en que soporte la resuelve, para documentar la decisión, comprobar los reintegros y atender reclamos relacionados. Si cerrás tu cuenta, el registro se conserva desvinculado de tu perfil durante ese plazo.'
      ]
    },
    {
      title: 'Cómo ejercer tus derechos',
      paragraphs: [
        'Desde tu sesión podés corregir algunos datos de tu perfil. En el portal de clientes podés actualizar tu nombre, teléfono, fecha de nacimiento y notas.',
        'Podés retirar tu autorización para guardar mediciones desde tu perfil del portal o mediante tu entrenador o gimnasio. Al retirarla, se detiene el registro de nuevas mediciones y podés solicitar la eliminación de datos ya guardados cuando corresponda.',
        'Podés solicitar acceso, actualización, rectificación o supresión de tus datos y revocar el consentimiento cuando corresponda. Para consultas o solicitudes sobre tu ficha, contactá primero a tu entrenador o gimnasio.',
        `Para solicitudes sobre tu cuenta o tu acceso a Zummith, enviá un mensaje directo a ${supportChannel} e indicá qué solicitás. Para verificar tu identidad, te pediremos que confirmés la solicitud desde el correo electrónico registrado en tu cuenta de Zummith.`,
        'Para las solicitudes cubiertas por la Ley 8968 de Costa Rica, el trámite es gratuito y se resuelve en cinco días hábiles desde su recepción. También podés presentar una denuncia ante la Agencia de Protección de Datos de los Habitantes.'
      ]
    },
    {
      title: 'Cookies y almacenamiento en el navegador',
      anchor: 'cookies',
      paragraphs: [
        'Zummith guarda datos en tu navegador para que puedas volver a tu trabajo. Podés borrarlos desde la configuración del navegador. Esto puede cerrar tu sesión y eliminar preferencias o borradores guardados en ese dispositivo.',
        'Podés revisar o cambiar tu elección desde el enlace Cookies en el pie de página. Si hay servicios opcionales disponibles, se activan cuando autorizás su categoría.',
        '[Completar con las cookies y herramientas de terceros verificadas en producción, su finalidad y duración.]'
      ],
      entries: [
        {
          title: 'Sesión',
          description: 'Permite mantener tu acceso a la cuenta en el navegador.'
        },
        {
          title: 'Preferencias',
          description: 'Recuerda el entrenador o gimnasio que seleccionaste y el gimnasio activo en tu espacio de trabajo.'
        },
        {
          title: 'Elección de cookies',
          description: 'La cookie zummith_cookie_preferences recuerda tu elección sobre cookies durante 182 días en este navegador.'
        },
        {
          title: 'Borradores',
          description: 'Permite recuperar rutinas, fichas de competidor y la configuración de un gimnasio que empezaste en el navegador.'
        }
      ]
    }
  ]
};
