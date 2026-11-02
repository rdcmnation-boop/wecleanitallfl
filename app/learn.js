// Learning area: short lessons with quizzes for cleaners and owners, how-to guides for customers, and a supplies guide per service.
// Educational text only. What each service includes exactly is confirmed by the company when booking.
// Business topics are general information, not legal or insurance advice: confirm those with a professional.
// Stores in the Sunrise (33351) area for price checks and rentals. Listed for comparison only; they are not partners.
// Name, address and phone from Google Places. Hours change, so the app links to Google Maps for current hours.
const NEARBY = [
  { n: "Lowe's Home Improvement", a: "8050 W Oakland Park Blvd, Sunrise, FL 33351", tel: "+19545780246", map: "https://www.google.com/maps/search/?api=1&query=Lowe%27s+Sunrise+FL&query_place_id=ChIJfWCHbxQG2YgR8CXaJtEP_zc" },
  { n: "The Home Depot", a: "2901 N University Dr, Sunrise, FL 33322", tel: "+19547478226", map: "https://www.google.com/maps/search/?api=1&query=The+Home+Depot+Sunrise+FL&query_place_id=ChIJ2WM5thUG2YgRjdfFF2V1BvU" },
  { n: "The Home Depot", a: "12525 W Sunrise Blvd, Sunrise, FL 33323", tel: "+19548359379", map: "https://www.google.com/maps/search/?api=1&query=The+Home+Depot+12525+W+Sunrise+Blvd&query_place_id=ChIJdZh4f_wI2YgRxcoUOLO_0X4" },
  { n: "Cleaning Depot Supply", a: "10412 W McNab Rd, Tamarac, FL 33321", tel: "+19545616352", map: "https://www.google.com/maps/search/?api=1&query=Cleaning+Depot+Supply+Tamarac+FL&query_place_id=ChIJO3NeJ1EG2YgRcSW5KjWU228" },
  { n: "A Cleaning Supplies and Rentals", a: "1660 E Oakland Park Blvd, Oakland Park, FL 33334", tel: "+19545303551", map: "https://www.google.com/maps/search/?api=1&query=A+Cleaning+Supplies+and+Rentals+Oakland+Park+FL&query_place_id=ChIJZ_iZE4wB2YgRYqiLKW68hOg" },
  { n: "Everlast Cleaning Equipment & Supplies", a: "6881 NW 16th Terrace, Fort Lauderdale, FL 33309", tel: "+18003995901", map: "https://www.google.com/maps/search/?api=1&query=Everlast+Cleaning+Equipment+Fort+Lauderdale+FL&query_place_id=ChIJS7BwP70G2YgRDCSJ67v9Ztk" },
  { n: "Rex Rentals", a: "1921 S State Rd 7, Davie, FL 33317", tel: "+19545841800", map: "https://www.google.com/maps/search/?api=1&query=Rex+Rentals+Davie+FL&query_place_id=ChIJo-SAKFsH2YgRiQjjwkMj_NE" },
  { n: "Rental Center at The Home Depot", a: "12525 W Sunrise Blvd, Sunrise, FL 33323", tel: "+19548375508", map: "https://www.google.com/maps/search/?api=1&query=Home+Depot+Rental+Center+12525+W+Sunrise+Blvd+Sunrise+FL&query_place_id=ChIJHdTviPwI2YgR1x-SqPjNSng" },
  { n: "Veseris", a: "6600 NW 16th St #7, Plantation, FL 33313", tel: "+19545858753", map: "https://www.google.com/maps/search/?api=1&query=Veseris+Plantation+FL&query_place_id=ChIJ53VYzVAG2YgRRKhXlP7bO-k" },
  { n: "Sunbelt Rentals (aerial lifts)", a: "6580 W State Rd 84, Davie, FL 33317", tel: "+19547537556", map: "https://www.google.com/maps/search/?api=1&query=Sunbelt+Rentals+Davie+FL&query_place_id=ChIJ7yjnxDsH2YgRm6cDPuTQNok" }
];
window.WCIA_LEARN = {
  es: {
    nearby: NEARBY,
    // Sponsored partners (supply businesses). Empty until partner agreements exist. Each: { n: name, what: what they sell, url: https link }.
    partners: [],
    shop: [
      { n: "Paños de microfibra", q: "microfiber cleaning cloths" },
      { n: "Aspiradora con filtro HEPA", q: "HEPA filter vacuum" },
      { n: "Desengrasante para cocina", q: "heavy duty kitchen degreaser" },
      { n: "Limpiador de vidrios", q: "glass cleaner" },
      { n: "Guantes de nitrilo", q: "nitrile gloves" }
    ],
    rent: [
      { n: "Extractora de alfombras", q: "carpet extractor rental" },
      { n: "Escalera o extensión", q: "extension ladder rental" },
      { n: "Aspiradora HEPA industrial", q: "HEPA vacuum rental" }
    ],
    cleaner: [
      { id: "safety", title: "Seguridad y químicos",
        steps: ["Lee la etiqueta de cada producto antes de usarlo.", "Nunca mezcles cloro con amoníaco, vinagre ni otros ácidos: generan gases tóxicos.", "Ventila el cuarto y abre ventanas al usar químicos.", "Usa guantes. En escaleras, pide ayuda o usa una escalera estable.", "Si alguien se marea o le arde la garganta, sal a aire fresco y llama al 1-800-222-1222 (o al 911 si es grave)."],
        quiz: [
          { q: "¿Qué pasa si mezclas cloro con amoníaco?", o: ["Limpia más rápido", "Se generan gases tóxicos", "No pasa nada"], a: 1, why: "Forman gases tóxicos. Nunca los mezcles." },
          { q: "¿Qué haces antes de usar un producto nuevo?", o: ["Usarlo en toda la casa", "Leer la etiqueta y probarlo en un lugar escondido", "Mezclarlo con otro para que limpie más"], a: 1, why: "La etiqueta dice cómo usarlo. Probar en un lugar escondido evita daños." }
        ] },
      { id: "order", title: "Orden de trabajo",
        steps: ["Empieza por arriba: techo, ventiladores, luces y muebles altos.", "Polvo primero, agua después, para no volver a ensuciar lo ya limpio.", "Usa dos paños: uno para limpiar y otro para secar.", "Baños y cocina casi al final; los pisos, al final.", "Revisa al terminar: superficies, espejos y basura."],
        quiz: [
          { q: "¿Por qué se quita el polvo antes que el agua?", o: ["El agua quita más polvo", "Para no ensuciar de nuevo lo que ya limpiaste", "Porque es más rápido"], a: 1, why: "Si mojas primero, el polvo que cae después vuelve a manchar." },
          { q: "¿Cuándo se limpian los pisos?", o: ["Al principio", "Al final, cuando todo lo demás ya cayó", "Antes de limpiar los baños"], a: 1, why: "Así no ensucias el piso ya limpio." }
        ] },
      { id: "client", title: "Llegar y trabajar con el cliente",
        steps: ["Llega a tiempo. Si vas a tardar, avísalo en la app.", "Confirma el acceso y los códigos sin anotarlos fuera de la app.", "Pregunta qué zonas no se tocan y respétalo.", "No abras gavetas personales ni uses cosas del cliente sin permiso.", "Si algo se rompe, avisa de inmediato a la empresa con foto y una descripción."],
        quiz: [
          { q: "Si algo se rompe durante el trabajo, ¿qué haces?", o: ["Lo escondes", "Avisas de inmediato a la empresa", "Esperas a que el cliente lo note"], a: 1, why: "Avisar pronto protege al cliente y a ti." },
          { q: "¿Puedes usar las cosas del cliente sin preguntar?", o: ["Sí, si es poco", "No, pide permiso", "Sí, si estás cansado"], a: 1, why: "Siempre pide permiso antes de usar algo del cliente." }
        ] },
      { id: "surfaces", title: "Cuidado de cada superficie",
        steps: ["Piedra natural (mármol, granito): usa un limpiador de pH neutro, nada de ácidos.", "Acero inoxidable: limpiador suave y seca para evitar manchas; sin cloro.", "Madera y laminados: muy poca agua, bien escurrida.", "Microfibra: lávala sin suavizante para que siga absorbiendo.", "Vidrio: usa limpiador de vidrios y evita el sol directo para que no deje rayas."],
        quiz: [
          { q: "¿Qué limpiador conviene para el mármol?", o: ["Vinagre", "Un limpiador de pH neutro", "Cloro diluido"], a: 1, why: "Los ácidos y el cloro dañan la piedra natural." },
          { q: "¿Cómo se limpia un piso de madera?", o: ["Con mucha agua", "Con poca agua y bien escurrido", "Con cloro"], a: 1, why: "El exceso de agua hincha y daña la madera." }
        ] },
      { id: "wellbeing", title: "Tu salud en el trabajo",
        steps: ["Usa productos sin fragancia fuerte ni aerosoles cuando puedas: irritan los pulmones.", "Prefiere agua y microfibra; muchas veces no necesitas químico.", "Diluye según la etiqueta: más producto no limpia mejor.", "Protege piel y ojos: guantes, y gafas si salpica. Lávate las manos al terminar.", "Levanta con las piernas, no con la espalda. Con calor fuerte, toma agua a menudo y descansa a la sombra."],
        quiz: [
          { q: "¿Qué ayuda más a proteger tus pulmones?", o: ["Usar aerosoles fuertes", "Ventilar y evitar aerosoles cuando se puede", "Respirar cerca del producto"], a: 1, why: "Ventilar y evitar aerosoles reduce lo que respiras." },
          { q: "En un día de calor fuerte, ¿qué haces?", o: ["Trabajar sin parar", "Tomar agua a menudo, descansar en sombra y avisar si te sientes mal", "Seguir sin decir nada"], a: 1, why: "El calor puede causar agotamiento. Descansa, toma agua y avisa." }
        ] }
    ],
    customer: [
      { id: "prepare", title: "Cómo prepararte para la limpieza",
        steps: ["Recoge objetos de valor y papeles importantes.", "Deja la ropa del piso recogida o en un lugar seguro.", "Avisa si hay mascotas y dónde van a estar.", "Deja agua y luz disponibles, y el acceso listo.", "Anota en la reserva las zonas que no quieres que se toquen."] },
      { id: "care", title: "Cuidado de tu casa entre limpiezas",
        steps: ["Ventila el baño después de la ducha: reduce el moho.", "Seca los fregaderos y los pisos del baño después de usarlos.", "Limpia los filtros del aire acondicionado cada pocos meses.", "Si ves moho, avísanos: a veces es humedad que hay que arreglar.", "Guarda los productos fuertes lejos de niños y mascotas."] },
      { id: "homehealth", title: "Una casa más sana",
        steps: ["Si hay niños, mascotas o asma en casa, prefiere productos sin fragancia fuerte.", "Ventila la casa al limpiar y unos minutos después.", "Guarda los productos en su envase original, bien cerrados y fuera de alcance.", "Quita el polvo con paño húmedo para no levantarlo al aire.", "Cambia los filtros del aire acondicionado según el fabricante."] },
      { id: "workplace", title: "Un lugar de trabajo más sano", steps: ["Pide productos sin fragancia fuerte si hay personas con asma o alergias.", "Ten desinfectante de manos disponible y revisa que no falte.", "Acuerda con la empresa qué zonas se limpian a diario y cuáles cada semana.", "Mantén pasillos y salidas libres para que la limpieza y la ventilación funcionen.", "Reporta fugas, moho o malos olores cuanto antes: casi siempre son humedad."] }
    ],
    owner: [
      { id: "biz-safety", title: "Un negocio de limpieza sano y seguro",
        steps: ["Da entrenamiento de seguridad y químicos antes del primer trabajo.", "Escribe los procedimientos por servicio y úsalos en cada trabajo.", "Ten equipo de protección disponible (guantes, gafas, mascarillas) y reemplázalo a tiempo.", "Pregunta a un agente de seguros qué cobertura necesita tu negocio; no supongas que estás cubierto.", "Cuida a tu equipo: horarios razonables, pausas y pago a tiempo. La rotación cuesta dinero."],
        quiz: [
          { q: "¿Qué reduce más los accidentes en un equipo de limpieza?", o: ["Contratar más rápido", "Entrenamiento y procedimientos escritos", "Trabajar más horas"], a: 1, why: "Un procedimiento claro y entrenado evita errores repetidos." },
          { q: "¿Qué haces con la cobertura de seguros?", o: ["Asumir que estás cubierto", "Preguntar a un agente de seguros qué cubre tu negocio", "Esperar a que haya un problema"], a: 1, why: "Cada negocio necesita una cobertura distinta; confírmala con un profesional." }
        ] },
      { id: "biz-price", title: "Precios que cubren tu costo",
        steps: ["Cuenta el costo real de una hora: pago, transporte, productos y tiempo de viaje.", "Decide si cobras el tiempo de estimación y las cancelaciones de último momento, y dilo en tu política.", "Revisa tus precios cada pocos meses o cuando suban los costos.", "Un precio por hora bajo obliga a trabajar más horas y limpiar peor.", "Calcula tu margen: lo que queda después de pagar a tu equipo y a los gastos."],
        quiz: [
          { q: "¿Qué debes incluir en el costo por hora?", o: ["Solo lo que pagas al limpiador", "Pago, transporte, productos y tiempo de viaje", "Solo el precio de la competencia"], a: 1, why: "Si no cuentas todo, cada trabajo deja pérdidas escondidas." },
          { q: "¿Qué pasa si cobras muy bajo?", o: ["Trabajas menos", "Trabajas más horas, limpias peor y pierdes limpiadores", "Tienes más clientes sin problema"], a: 1, why: "Un precio bajo presiona todo el negocio." }
        ] },
      { id: "biz-quality", title: "Calidad y reseñas",
        steps: ["Usa una lista de revisión por servicio y marca lo terminado.", "Haz una revisión corta después de cada cliente nuevo.", "Responde a cada reseña, buena o mala, con calma y en el idioma del cliente.", "Si algo salió mal, reconócelo y ofrece corregirlo.", "Mira los números: cancelaciones, reseñas y clientes que repiten."],
        quiz: [
          { q: "¿Cómo respondes a una reseña negativa?", o: ["Discutes con el cliente", "Respondes con calma, reconoces el problema y ofreces corregirlo", "La borras"], a: 1, why: "Una respuesta calmada muestra cómo trabajas y ayuda a otros clientes." },
          { q: "¿Qué número indica si tu servicio funciona?", o: ["Solo cuántas horas trabajas", "Clientes que repiten y reseñas", "Cuántos anuncios publicas"], a: 1, why: "Los clientes que vuelven y sus opiniones son la mejor señal de calidad." }
        ] },
      { id: "biz-workplace", title: "Lugares de trabajo más sanos",
        steps: ["Ventila: abre ventanas o sube la renovación de aire unos minutos al día.", "Limpia primero lo que más se toca: pomos, interruptores, teclados, teléfonos y grifos.", "Define una frecuencia por zona: lo que más se toca, varias veces por semana; el resto, según el uso.", "Revisa que haya jabón, papel y desinfectante de manos en los baños; es lo que más se nota.", "Controla el polvo con paño húmedo y aspiradora con filtro HEPA, no con escoba."],
        quiz: [
          { q: "¿Qué superficies conviene limpiar con más frecuencia?", o: ["Las paredes altas", "Las que más se tocan: pomos, teclados y grifos", "Las ventanas de afuera"], a: 1, why: "Ahí se acumulan más gérmenes y suciedad." },
          { q: "¿Cómo se controla mejor el polvo?", o: ["Con escoba", "Con paño húmedo y aspiradora con filtro HEPA", "Soplándolo"], a: 1, why: "Así el polvo no vuelve al aire." }
        ] }
    ],
    kit: {
      common: { brings: ["Microfibra en colores (una por zona)", "Escoba y recogedor", "Trapeador y balde", "Guantes", "Limpiador multiuso de pH neutro", "Desinfectante para superficies", "Esponjas no abrasivas", "Bolsas de basura"],
        home: ["Agua y luz disponibles", "Un lugar seguro para dejar el equipo", "Acceso con el código o la llave acordados"] },
      services: {
        standard: { brings: [], home: [] },
        deep: { brings: ["Cepillos de cerdas suaves para juntas", "Removedor de cal para grifos"], home: ["Muebles que se puedan mover para limpiar detrás"] },
        move: { brings: ["Limpiador para horno y refrigerador", "Bolsas grandes"], home: ["Agua caliente y enchufes en funcionamiento"] },
        airbnb: { brings: ["Bolsas de basura extra"], home: ["Sábanas, toallas y artículos de cortesía, si los provees tú"] },
        post_construction: { brings: ["Aspiradora con filtro HEPA", "Trapos húmedos para polvo fino", "Mascarilla y gafas"], home: ["Muebles retirados o cubiertos", "Ventilación al terminar"] },
        windows: { brings: ["Limpiador de vidrios", "Rasqueta", "Escalera o extensión según la altura"], home: ["Acceso al exterior o al balcón, si aplica"] },
        carpet: { brings: ["Extractora de alfombras", "Solución para alfombras"], home: ["Mover muebles pequeños antes", "Ventilación para que seque"] },
        office: { brings: ["Limpiador para escritorios y teclados"], home: ["Horario de acceso acordado", "Tomas de corriente disponibles"] },
        restaurant: { brings: ["Desengrasante fuerte para cocina", "Cepillos de cocina", "Guantes de nitrilo"], home: ["Horario fuera del servicio"] },
        bank: { brings: ["Limpiador sin olor fuerte", "Microfibra extra"], home: ["Acceso aprobado y horario acordado"] },
        hotel: { brings: ["Limpiadores para baños", "Bolsas de basura"], home: ["Acceso a las habitaciones coordinado con recepción"] },
        building: { brings: ["Equipo para áreas comunes", "Señalización de piso mojado"], home: ["Permiso del administrador del edificio"] }
      }
    }
  },
  en: {
    nearby: NEARBY,
    // Sponsored partners (supply businesses). Empty until partner agreements exist. Each: { n: name, what: what they sell, url: https link }.
    partners: [],
    shop: [
      { n: "Microfiber cleaning cloths", q: "microfiber cleaning cloths" },
      { n: "HEPA filter vacuum", q: "HEPA filter vacuum" },
      { n: "Heavy-duty kitchen degreaser", q: "heavy duty kitchen degreaser" },
      { n: "Glass cleaner", q: "glass cleaner" },
      { n: "Nitrile gloves", q: "nitrile gloves" }
    ],
    rent: [
      { n: "Carpet extractor", q: "carpet extractor rental" },
      { n: "Extension ladder", q: "extension ladder rental" },
      { n: "Industrial HEPA vacuum", q: "HEPA vacuum rental" }
    ],
    cleaner: [
      { id: "safety", title: "Safety and chemicals",
        steps: ["Read the label of every product before you use it.", "Never mix bleach with ammonia, vinegar or other acids: they make toxic gases.", "Ventilate the room and open windows when using chemicals.", "Wear gloves. On ladders, ask for help or use a stable ladder.", "If someone feels dizzy or their throat burns, get to fresh air and call 1-800-222-1222 (or 911 if serious)."],
        quiz: [
          { q: "What happens if you mix bleach and ammonia?", o: ["It cleans faster", "It makes toxic gases", "Nothing happens"], a: 1, why: "They form toxic gases. Never mix them." },
          { q: "What do you do before using a new product?", o: ["Use it everywhere", "Read the label and test it in a hidden spot", "Mix it with another to clean more"], a: 1, why: "The label says how to use it. A hidden test prevents damage." }
        ] },
      { id: "order", title: "Work order",
        steps: ["Start at the top: ceiling, fans, lights and high furniture.", "Dust first, water after, so you don't re-soil clean surfaces.", "Use two cloths: one to clean, one to dry.", "Bathrooms and kitchen almost last; floors last.", "Check at the end: surfaces, mirrors and trash."],
        quiz: [
          { q: "Why dust before using water?", o: ["Water removes more dust", "So you don't re-soil what's already clean", "Because it's faster"], a: 1, why: "If you wet first, dust that falls later stains the clean surface." },
          { q: "When do you clean the floors?", o: ["First", "Last, when everything else has settled", "Before the bathrooms"], a: 1, why: "That way you don't dirty a clean floor." }
        ] },
      { id: "client", title: "Arriving and working with the client",
        steps: ["Arrive on time. If you'll be late, say so in the app.", "Confirm access and codes without writing them outside the app.", "Ask which areas are off limits and respect it.", "Don't open personal drawers or use the client's things without permission.", "If something breaks, tell the company right away with a photo and a description."],
        quiz: [
          { q: "If something breaks during the job, what do you do?", o: ["Hide it", "Tell the company right away", "Wait for the client to notice"], a: 1, why: "Telling us early protects the client and you." },
          { q: "Can you use the client's things without asking?", o: ["Yes, if it's a little", "No, ask for permission", "Yes, if you're tired"], a: 1, why: "Always ask permission before using anything of the client's." }
        ] },
      { id: "surfaces", title: "Caring for each surface",
        steps: ["Natural stone (marble, granite): use a pH-neutral cleaner, no acids.", "Stainless steel: use a mild cleaner and dry it to avoid streaks; no bleach.", "Wood and laminate: very little water, well wrung out.", "Microfiber: wash without fabric softener so it keeps absorbing.", "Glass: use a glass cleaner and avoid direct sun so it doesn't streak."],
        quiz: [
          { q: "Which cleaner suits marble?", o: ["Vinegar", "A pH-neutral cleaner", "Diluted bleach"], a: 1, why: "Acids and bleach damage natural stone." },
          { q: "How do you clean a wood floor?", o: ["With lots of water", "With very little water, well wrung out", "With bleach"], a: 1, why: "Too much water swells and damages wood." }
        ] },
      { id: "wellbeing", title: "Your health on the job",
        steps: ["Use products without strong fragrance or sprays when you can: they irritate the lungs.", "Prefer water and microfiber; often you don't need a chemical.", "Dilute as the label says: more product doesn't clean better.", "Protect skin and eyes: gloves, and goggles if splashing. Wash your hands at the end.", "Lift with your legs, not your back. In strong heat, drink water often and rest in the shade."],
        quiz: [
          { q: "What helps protect your lungs most?", o: ["Using strong sprays", "Ventilating and avoiding sprays when you can", "Breathing close to the product"], a: 1, why: "Ventilating and avoiding sprays reduces what you breathe." },
          { q: "On a very hot day, what do you do?", o: ["Work nonstop", "Drink water often, rest in the shade and say so if you feel unwell", "Keep going without saying anything"], a: 1, why: "Heat can cause exhaustion. Rest, drink water and tell someone." }
        ] }
    ],
    customer: [
      { id: "prepare", title: "How to get ready for a cleaning",
        steps: ["Put away valuables and important papers.", "Pick up clothes from the floor or move them somewhere safe.", "Tell us if there are pets and where they will be.", "Leave water and power on, and access ready.", "Note in your booking which areas should not be touched."] },
      { id: "care", title: "Caring for your home between cleanings",
        steps: ["Ventilate the bathroom after showers: it reduces mold.", "Dry sinks and bathroom floors after use.", "Clean the air conditioner filters every few months.", "If you see mold, tell us: it's often moisture that needs fixing.", "Keep strong products away from children and pets."] },
      { id: "homehealth", title: "A healthier home",
        steps: ["If there are children, pets or asthma at home, prefer products without strong fragrance.", "Ventilate the home while cleaning and for a few minutes after.", "Keep products in their original containers, closed and out of reach.", "Dust with a damp cloth so it doesn't go into the air.", "Change air conditioner filters as the manufacturer advises."] },
      { id: "workplace", title: "A healthier workplace", steps: ["Ask for products without strong fragrance if people have asthma or allergies.", "Keep hand sanitizer stocked and check it regularly.", "Agree with the company which areas are cleaned daily and which weekly.", "Keep aisles and exits clear so cleaning and ventilation work well.", "Report leaks, mold or bad smells early: they're usually moisture."] }
    ],
    owner: [
      { id: "biz-safety", title: "A safe, healthy cleaning business",
        steps: ["Train your team on safety and chemicals before the first job.", "Write the procedure for each service and use it on every job.", "Keep protective gear on hand (gloves, goggles, masks) and replace it on time.", "Ask an insurance agent what coverage your business needs; don't assume you're covered.", "Look after your team: reasonable hours, breaks and on-time pay. Turnover costs money."],
        quiz: [
          { q: "What reduces accidents on a cleaning team the most?", o: ["Hiring faster", "Training and written procedures", "Working more hours"], a: 1, why: "A clear, trained procedure prevents repeated mistakes." },
          { q: "What do you do about insurance coverage?", o: ["Assume you're covered", "Ask an insurance agent what your business is covered for", "Wait for a problem to happen"], a: 1, why: "Every business needs different coverage; confirm it with a professional." }
        ] },
      { id: "biz-price", title: "Prices that cover your costs",
        steps: ["Work out the real cost of an hour: pay, transport, supplies and travel time.", "Decide whether you charge for estimate visits and last-minute cancellations, and state it in your policy.", "Review prices every few months or when costs rise.", "A low hourly price forces longer hours and worse cleaning.", "Calculate your margin: what's left after paying your team and expenses."],
        quiz: [
          { q: "What should the hourly cost include?", o: ["Only what you pay the cleaner", "Pay, transport, supplies and travel time", "Only the competitor's price"], a: 1, why: "If you leave costs out, every job quietly loses money." },
          { q: "What happens if you price too low?", o: ["You work less", "You work longer hours, clean worse and lose cleaners", "You get more clients with no problems"], a: 1, why: "A low price pressures the whole business." }
        ] },
      { id: "biz-quality", title: "Quality and reviews",
        steps: ["Use a checklist for each service and mark what's done.", "Do a short check after every new client's first job.", "Answer every review, good or bad, calmly and in the client's language.", "If something went wrong, acknowledge it and offer to fix it.", "Watch the numbers: cancellations, reviews and repeat clients."],
        quiz: [
          { q: "How do you answer a negative review?", o: ["Argue with the client", "Reply calmly, acknowledge the problem and offer to fix it", "Delete it"], a: 1, why: "A calm reply shows how you work and helps other clients." },
          { q: "Which number shows your service works?", o: ["Only how many hours you work", "Repeat clients and reviews", "How many ads you run"], a: 1, why: "Clients who come back and what they say are the best quality signals." }
        ] },
      { id: "biz-workplace", title: "Healthier workplaces",
        steps: ["Ventilate: open windows or raise the air exchange for a few minutes a day.", "Clean the most-touched things first: handles, switches, keyboards, phones and faucets.", "Set a frequency per zone: most-touched areas several times a week, the rest as use requires.", "Check that soap, paper and hand sanitizer are stocked in bathrooms; that's what people notice.", "Control dust with a damp cloth and a HEPA-filter vacuum, not a broom."],
        quiz: [
          { q: "Which surfaces should be cleaned most often?", o: ["High walls", "The most-touched ones: handles, keyboards and faucets", "Outside windows"], a: 1, why: "Germs and grime build up most on touched surfaces." },
          { q: "What controls dust best?", o: ["A broom", "A damp cloth and a HEPA-filter vacuum", "Blowing it off"], a: 1, why: "That way dust doesn't go back into the air." }
        ] }
    ],
    kit: {
      common: { brings: ["Colored microfiber (one per zone)", "Broom and dustpan", "Mop and bucket", "Gloves", "Multi-surface pH-neutral cleaner", "Surface disinfectant", "Non-abrasive sponges", "Trash bags"],
        home: ["Water and power available", "A safe place to leave equipment", "Access with the agreed code or key"] },
      services: {
        standard: { brings: [], home: [] },
        deep: { brings: ["Soft-bristle brushes for grout", "Limescale remover for faucets"], home: ["Furniture that can be moved to clean behind"] },
        move: { brings: ["Oven and fridge cleaner", "Large bags"], home: ["Hot water and working outlets"] },
        airbnb: { brings: ["Extra trash bags"], home: ["Sheets, towels and amenities, if you provide them"] },
        post_construction: { brings: ["HEPA-filter vacuum", "Damp cloths for fine dust", "Mask and goggles"], home: ["Furniture removed or covered", "Ventilation after the job"] },
        windows: { brings: ["Glass cleaner", "Squeegee", "Ladder or extension pole, depending on height"], home: ["Access to the outside or balcony, if applicable"] },
        carpet: { brings: ["Carpet extractor", "Carpet solution"], home: ["Move small furniture first", "Ventilation so it dries"] },
        office: { brings: ["Desk and keyboard cleaner"], home: ["Agreed access hours", "Outlets available"] },
        restaurant: { brings: ["Heavy-duty kitchen degreaser", "Kitchen brushes", "Nitrile gloves"], home: ["Hours outside of service"] },
        bank: { brings: ["Fragrance-free cleaner", "Extra microfiber"], home: ["Approved access and agreed hours"] },
        hotel: { brings: ["Bathroom cleaners", "Trash bags"], home: ["Room access coordinated with the front desk"] },
        building: { brings: ["Common-area equipment", "Wet-floor signs"], home: ["Permission from the building manager"] }
      }
    }
  }
};

// How to start a cleaning business. Shown to everyone in the Learn tab. General steps only:
// not legal, tax or insurance advice. Official sources are named so people can check the current rules themselves.
const STARTUP_ES = [
  { id: "start-plan", title: "1. Antes de empezar: tu plan",
    steps: ["Elige primero uno o dos servicios, por ejemplo limpieza regular de casas o cambios rápidos de Airbnb. Es más fácil controlar la calidad.", "Calcula tu costo real por trabajo: tu tiempo, productos, equipo, gasolina y el tiempo que pasas entre clientes.", "Escribe qué incluye cada servicio, qué no incluye y cuánto tarda. Así evitas malentendidos con el cliente.", "Antes de firmar nada, habla con un contador o abogado sobre cómo registrar tu negocio."],
    quiz: [
      { q: "¿Por qué conviene contar el tiempo de viaje entre trabajos?", o: ["No hace falta contarlo", "Es parte del costo real del día", "Solo importa si el cliente vive lejos"], a: 1, why: "El viaje gasta tiempo y gasolina. Si no lo cuentas, cobras menos de lo que te cuesta trabajar." }
    ] },
  { id: "start-legal", title: "2. Registro, impuestos y seguro",
    steps: ["En Florida muchas personas registran su negocio como LLC. El registro se hace en sunbiz.org, de la División de Corporaciones de Florida.", "Puedes obtener un número de identificación fiscal (EIN) gratis en IRS.gov. Desconfía de sitios que cobran por ese trámite.", "Pregunta a tu ciudad o condado si necesitas un permiso de negocio local (Local Business Tax Receipt).", "Pregunta al Departamento de Ingresos de Florida si tus servicios pagan impuesto de ventas.", "Habla con un agente de seguros sobre responsabilidad civil general y, si tendrás empleados, compensación de trabajadores."],
    quiz: [
      { q: "¿Dónde puedes obtener un EIN gratis?", o: ["En IRS.gov", "Pagando a un sitio privado", "En una tienda de limpieza"], a: 0, why: "El IRS ofrece el EIN gratis en su sitio oficial. Otros sitios cobran por el mismo trámite." }
    ] },
  { id: "start-clients", title: "3. Conseguir clientes y reseñas",
    steps: ["Crea un perfil de Google Business con tu nombre, tu zona de servicio y fotos reales de tu trabajo.", "Pide una reseña a cada cliente satisfecho y envíale el enlace directo a tu perfil.", "Pide referidos a vecinos, administradores de edificios y conocidos.", "No compres reseñas falsas ni prometas precios o fechas que no puedes cumplir."],
    quiz: [
      { q: "¿Qué ayuda más a conseguir clientes al principio?", o: ["Reseñas reales y referidos de clientes satisfechos", "Comprar reseñas falsas", "Prometer el precio más bajo sin calcularlo"], a: 0, why: "Las reseñas reales y los referidos generan confianza. Las falsas se pueden descubrir y dañan tu nombre." }
    ] },
  { id: "start-money", title: "4. Dinero: cobrar, guardar y apartar impuestos",
    steps: ["Abre una cuenta bancaria solo para el negocio.", "Cobra con una factura escrita: fecha, servicio y monto.", "Guarda los recibos de productos, equipo y gasolina.", "Aparta una parte de cada pago para impuestos antes de gastarla."],
    quiz: [
      { q: "¿Para qué sirve una cuenta solo del negocio?", o: ["Para mezclar gastos personales y del negocio", "Para llevar cuentas claras y preparar los impuestos", "No sirve para nada"], a: 1, why: "Con cuentas separadas sabes cuánto ganas de verdad y es más fácil preparar los impuestos." }
    ] },
  { id: "start-team", title: "5. Si contratas: personas, capacitación y seguridad",
    steps: ["Revisa antecedentes y referencias antes de dar acceso a casas o negocios.", "Haz una lista de tareas para cada servicio y entrénala en un trabajo acompañado.", "Define por escrito si la persona es empleada o contratista. Esa diferencia tiene reglas legales; consulta a un profesional.", "Ten un plan para emergencias: qué hacer si alguien se lastima, se intoxica o rompe algo del cliente."] }
];
const STARTUP_EN = [
  { id: "start-plan", title: "1. Before you start: your plan",
    steps: ["Start with one or two services, such as regular home cleaning or quick Airbnb turnovers. It is easier to keep quality high.", "Work out your real cost per job: your time, supplies, equipment, gas, and the time you spend between clients.", "Write down what each service includes, what it does not include, and how long it takes. This avoids misunderstandings with clients.", "Before you sign anything, talk to an accountant or lawyer about how to register your business."],
    quiz: [
      { q: "Why count the travel time between jobs?", o: ["You don't need to count it", "It is part of your real cost for the day", "It only matters if the client lives far away"], a: 1, why: "Travel costs time and gas. If you don't count it, you charge less than the work costs you." }
    ] },
  { id: "start-legal", title: "2. Registration, taxes and insurance",
    steps: ["In Florida many people register their business as an LLC. Registration is done at sunbiz.org, the Florida Division of Corporations.", "You can get a federal Employer Identification Number (EIN) for free at IRS.gov. Be wary of sites that charge for this step.", "Ask your city or county whether you need a local business tax receipt.", "Ask the Florida Department of Revenue whether your services are subject to sales tax.", "Talk to an insurance agent about general liability and, if you will have employees, workers' compensation."],
    quiz: [
      { q: "Where can you get an EIN for free?", o: ["At IRS.gov", "From a private site that charges a fee", "At a cleaning supply store"], a: 0, why: "The IRS offers the EIN for free on its official site. Other sites charge for the same step." }
    ] },
  { id: "start-clients", title: "3. Getting clients and reviews",
    steps: ["Create a Google Business Profile with your name, service area, and real photos of your work.", "Ask every happy client for a review and send them a direct link to your profile.", "Ask for referrals from neighbors, building managers, and people you know.", "Do not buy fake reviews or promise prices or dates you cannot keep."],
    quiz: [
      { q: "What helps most with new clients at the start?", o: ["Real reviews and referrals from happy clients", "Buying fake reviews", "Promising the lowest price without calculating it"], a: 0, why: "Real reviews and referrals build trust. Fake reviews can be discovered and damage your name." }
    ] },
  { id: "start-money", title: "4. Money: get paid, keep records, set tax aside",
    steps: ["Open a bank account used only for the business.", "Bill with a written invoice: date, service, and amount.", "Keep receipts for supplies, equipment, and gas.", "Set aside part of every payment for taxes before you spend it."],
    quiz: [
      { q: "What is a business-only account for?", o: ["Mixing personal and business spending", "Keeping clear records and preparing taxes", "It is not useful"], a: 1, why: "Separate accounts show what you really earn and make taxes easier to prepare." }
    ] },
  { id: "start-team", title: "5. If you hire: people, training and safety",
    steps: ["Check background and references before giving anyone access to homes or businesses.", "Make a task list for each service and train it on a supervised job.", "Decide in writing whether a person is an employee or a contractor. The difference has legal rules; ask a professional.", "Have an emergency plan: what to do if someone is hurt, exposed to chemicals, or breaks something belonging to the client."] }
];
window.WCIA_LEARN.es.startup = STARTUP_ES;
window.WCIA_LEARN.en.startup = STARTUP_EN;

// Cleaning industry news. Each item was checked against its page; dates are the publication dates shown there.
// Newest first. Updated by hand; the date shown is when it was added to the app.
const NEWS_ES = [
  { date: "2026-09-03", src: "CMM / ISSA Today", url: "https://cmmonline.com/news/check-out-the-septemberoctober-2026-issa-today-digital-issue", text: "Edición sept./oct. 2026 de ISSA Today: vista previa del ISSA Show North America 2026, investigación sobre productos de limpieza y salud respiratoria, sostenibilidad e internet de las cosas (IoT)." },
  { date: "2026-02-17", src: "CMM (IBISWorld)", url: "https://cmmonline.com/news/u-s-janitorial-services-market-projected-to-grow-nearly-2-in-2026", text: "EE. UU.: IBISWorld prevé que los ingresos de los servicios de conserjería lleguen a unos US$112 mil millones en 2026 (+1.8%). Los salarios son el gasto más grande: 43.2% de los ingresos." },
  { date: "2025-07-21", src: "CMM (ResearchAndMarkets)", url: "https://cmmonline.com/news/global-janitorial-services-market-posts-single-digit-growth", text: "Mundial: el sector creció cerca de 4.27% al año entre 2021 y 2024, y se proyecta llegar a unos US$420 mil millones en 2031." }
];
const NEWS_EN = [
  { date: "2026-09-03", src: "CMM / ISSA Today", url: "https://cmmonline.com/news/check-out-the-septemberoctober-2026-issa-today-digital-issue", text: "ISSA Today Sept./Oct. 2026 issue: preview of ISSA Show North America 2026, research on cleaning products and respiratory health, sustainability, and IoT." },
  { date: "2026-02-17", src: "CMM (IBISWorld)", url: "https://cmmonline.com/news/u-s-janitorial-services-market-projected-to-grow-nearly-2-in-2026", text: "U.S.: IBISWorld expects janitorial services revenue to reach about US$112 billion in 2026 (+1.8%). Wages are the largest expense at 43.2% of revenue." },
  { date: "2025-07-21", src: "CMM (ResearchAndMarkets)", url: "https://cmmonline.com/news/global-janitorial-services-market-posts-single-digit-growth", text: "Worldwide: the sector grew about 4.27% a year from 2021 to 2024 and is forecast to reach about US$420 billion by 2031." }
];
window.WCIA_LEARN.es.news = NEWS_ES;
window.WCIA_LEARN.en.news = NEWS_EN;

// Stations with a stream address supplied by the owner (region: "fl" or "pe").
// Only https stream addresses play. An empty url shows the station as pending.
window.WCIA_RADIO_MANUAL = [
  { region: "pe", name: "Radio Onda Perú · Islay 105.5 FM", state: "Islay, Arequipa", url: "" }
];

