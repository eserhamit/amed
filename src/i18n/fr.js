module.exports = {
  lang: "fr", other: "en", otherLabel: "English",
  meta: {
    title: "Pub Goudale Genève · Bières pression, burgers et matchs à Châtelaine et à la Tourelle",
    desc: "Pubs Goudale à Genève : La Goudale à la pression, burgers maison et tous les grands matchs sur écran. Réservez en ligne à Châtelaine et à la Tourelle, bientôt à la Concorde.",
    tonight: "Ce soir au pub · Pub Goudale Genève",
    tonightDesc: "Places libres ce soir, match du jour et plat du jour dans les Pub Goudale de Genève.",
    concorde: "Ouverture du Pub Goudale Concorde · Genève",
    concordeDesc: "Le troisième Pub Goudale ouvre à la Concorde. Inscrivez-vous à la soirée d'ouverture.",
    legal: "Mentions légales · Pub Goudale Genève",
    privacy: "Protection des données · Pub Goudale Genève"
  },
  nav: { tonight: "Ce soir", pubs: "Nos pubs", menu: "Menu", carte: "Carte", groups: "Groupes", loyalty: "Fidélité", book: "Réserver", concorde: "Concorde", skip: "Aller au contenu" },
  status: { soon: "Ouverture prochaine", soonShort: "Bientôt", hoursSoon: "Horaires à venir", openUntil: "Ouvert · ferme à {time}", opensAt: "Fermé · ouvre à {time}", closed: "Fermé", open: "Ouvert" },
  days: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
  daysShort: ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"],
  hero: {
    eyebrow: "Pub · Brasserie · Sport — Genève",
    title1: "Une bonne bière,", title2: "trois adresses.",
    lead: "Bières pression, burgers maison et tous les grands matchs sur écran. À Châtelaine, à la Tourelle et bientôt à la Concorde.",
    book: "Réserver une table", tonight: "Ce soir au pub", dish: "Plat du jour"
  },
  pubs: {
    eyebrow: "Nos pubs", title: "Choisissez votre comptoir",
    lead: "Même carte, même accueil, trois quartiers. Le statut « ouvert » suit les horaires de chaque pub.",
    address: "Adresse", phone: "Tél.", onsite: "Sur place", hours: "Horaires", today: "auj.",
    todo: "À compléter", bookHere: "Réserver ici", route: "Itinéraire", review: "Avis Google",
    opening: "Soirée d'ouverture", soonText: "Le prochain Pub Goudale ouvre ici{date}. Même carte, mêmes pressions et un nouvel écran pour les matchs.",
    soonDate: " le {date}"
  },
  week: { eyebrow: "Midi · lundi au vendredi", title: "Menu de la semaine", lead: "Le plat du jour change chaque jour. Recevez le menu chaque lundi matin avec la newsletter.", today: "Aujourd'hui", none: "Pas encore publié" },
  carte: { eyebrow: "La carte", title: "Pression & cuisine", lead: "La Goudale à la pression, des burgers généreux et de quoi partager pendant le match. Ce qui est épuisé est indiqué en direct.", beers: "À la pression", food: "En cuisine", soldOut: "Épuisé", empty: "Carte bientôt en ligne." },
  sport: { eyebrow: "Sport", title: "Le match, c'est ici", board: "Cette semaine au pub", none: "Programme bientôt en ligne",
    f1: "Écrans dans toute la salle", f1d: "Football, rugby, hockey, F1 : les grandes affiches en direct.",
    f2: "Places en direct", f2d: "Les places libres du soir sont sur la page « Ce soir au pub ».",
    f3: "Groupes et privatisation", f3d: "Anniversaires, afterworks, soirées d'équipe : estimation immédiate." },
  resa: {
    eyebrow: "Réserver", title: "Gardez-nous une table",
    lead: "Choisissez votre pub, la date et le nombre de personnes. Le pub vous confirme votre réservation par e-mail.",
    groupsHint: "Plus de 15 personnes ? Utilisez le formulaire groupes.",
    pub: "Pub", date: "Date", time: "Heure", persons: "Personnes", occasion: "Occasion",
    occasions: ["Repas", "Soirée de match", "Anniversaire", "Afterwork"],
    name: "Nom", phone: "Téléphone", email: "E-mail", note: "Message (facultatif)",
    notePh: "Allergies, chaise bébé, match à voir…", submit: "Envoyer la demande",
    consent: "Vos coordonnées servent uniquement à gérer cette réservation (confirmation par e-mail). Voir la protection des données.",
    left: "{n} place(s) encore libre(s) à {pub} pour ce service.", full: "Complet pour ce service à {pub}. Choisissez une autre heure ou appelez le pub.",
    soonDisabled: "bientôt"
  },
  resaStatus: {
    title: "Votre réservation", pending: "En attente de confirmation", confirmed: "Confirmée", declined: "Refusée", cancelled: "Annulée", done: "Merci pour votre visite", noshow: "Non honorée",
    pendingText: "Le pub a bien reçu votre demande et vous confirme par e-mail dès que possible. Gardez ce lien pour suivre le statut.",
    confirmedText: "Votre table vous attend. À bientôt !", declinedText: "Le pub ne peut pas vous accueillir à ce créneau. Essayez une autre heure ou appelez-nous.",
    cancelledText: "Votre réservation est annulée.", doneText: "Si vous avez passé un bon moment, un avis Google nous aide beaucoup.",
    cancel: "Annuler ma réservation", cancelConfirm: "Oui, annuler", leaveReview: "Laisser un avis Google", newBooking: "Nouvelle réservation"
  },
  groups: {
    eyebrow: "Groupes & privatisation", title: "Votre soirée, clé en main",
    lead: "Anniversaire, afterwork, soirée d'équipe ou match entre amis. Choisissez une formule : le prix indicatif s'affiche tout de suite et le pub vous rappelle avec une offre.",
    perPerson: "/ pers.", pub: "Pub", date: "Date souhaitée", persons: "Personnes (dès 8)", budget: "Budget total en CHF (facultatif)",
    formule: "Formule", custom: "Sur mesure", customSub: "offre personnalisée",
    estimate: "Estimation", estimateCustom: "Offre sur mesure : le pub vous rappelle avec un prix.",
    estimateNote: "{n} pers. × {pp}.– · prix indicatif, offre définitive par le pub",
    overBudget: "Au-dessus de votre budget de {budget} CHF.", altFits: "La formule « {name} » ({total} CHF) rentre dans le budget.", altNone: "Choisissez « Sur mesure » : le pub vous proposera une solution.",
    name: "Nom", phone: "Téléphone", email: "E-mail", note: "Votre projet (facultatif)", notePh: "Occasion, horaire, match à diffuser, gâteau…",
    submit: "Demander une offre", none: "Décrivez votre projet, le pub vous fait une offre."
  },
  loyalty: {
    eyebrow: "Carte fidélité", title: "La 10e bière est offerte",
    lead: "Valable dans les trois pubs. Montrez votre code au comptoir à chaque pression : l'équipe ajoute un tampon. Au dixième, la bière est pour nous.",
    ask: "Recevez votre carte par e-mail", email: "Votre e-mail", submit: "Recevoir ma carte",
    cardTitle: "Ma carte fidélité", myCode: "Mon code", showCode: "À montrer au comptoir",
    left: "{n} pression(s) avant votre bière offerte.", ready: "Votre bière offerte vous attend ! Montrez votre code au comptoir.",
    gifts: "{n} bière(s) offerte(s) déjà.", keep: "Ajoutez cette page à l'écran d'accueil de votre téléphone pour la retrouver au comptoir."
  },
  news: { eyebrow: "Newsletter", title: "Le menu du lundi dans votre boîte", lead: "Plats de la semaine, grands matchs et ouverture de la Concorde. Un e-mail par semaine, désinscription en un clic.", email: "Adresse e-mail", submit: "S'inscrire", pubs: "Pubs qui vous intéressent" },
  tonight: { title1: "Ce soir", title2: "au pub", seats: "place(s) encore libre(s) ce soir", seatsAsk: "Places sur demande", seatsAskSub: "Réservez en ligne ou appelez le pub", full: "Complet", fullSub: "pour ce soir. Essayez demain ou appelez le pub.", match: "Match", noMatch: "Pas de grand match annoncé", dish: "Plat du jour", regular: "Carte habituelle", phone: "Téléphone", all: "Tout le site", openingCta: "S'inscrire à l'ouverture" },
  concorde: { eyebrow: "Bientôt · troisième adresse", title2: "Concorde", lead: "Même carte, mêmes pressions, un nouveau comptoir. Inscrivez-vous à la soirée d'ouverture : première tournée offerte aux inscrits.", leadDate: "Ouverture le {date}.", soon: "Date bientôt annoncée", soonSub: "Inscrivez-vous pour être prévenu", opened: "C'est ouvert !", units: ["jours", "heures", "min", "sec"], form: "Soirée d'ouverture", name: "Nom", persons: "Personnes", email: "E-mail", submit: "Je m'inscris", discover: "Découvrir le site" },
  flash: {
    resaSent: "Demande envoyée. Le pub vous confirme par e-mail.",
    groupSent: "Demande envoyée. Le pub vous recontacte rapidement avec une offre.",
    newsPending: "Presque fini : cliquez sur le lien reçu par e-mail pour confirmer votre inscription.",
    newsConfirmed: "Inscription confirmée. Premier e-mail lundi matin.",
    newsUnsub: "Vous êtes désinscrit. Vous ne recevrez plus d'e-mails.",
    loyaltySent: "Si cette adresse est valide, votre carte vient de vous être envoyée par e-mail.",
    openingSent: "C'est noté. Vous recevrez la date d'ouverture par e-mail.",
    resaCancelled: "Votre réservation est annulée."
  },
  errors: {
    title: "Vérifiez le formulaire", pub: "Choisissez un pub.", date: "Choisissez une date à partir d'aujourd'hui (au maximum 6 mois à l'avance).",
    time: "Indiquez une heure valide, par exemple 19:30.", closed: "Le pub est fermé à cette heure-là. Consultez les horaires.",
    persons: "Indiquez entre 1 et 15 personnes. Au-delà, utilisez le formulaire groupes.", groupPersons: "Le formulaire groupes est prévu de 8 à 200 personnes.",
    name: "Indiquez votre nom.", phone: "Indiquez un numéro de téléphone valide, par exemple 079 123 45 67.",
    email: "Indiquez une adresse e-mail valide, par exemple nom@exemple.ch.", contact: "Indiquez un téléphone ou un e-mail pour recevoir l'offre.",
    full: "Il ne reste que {n} place(s) pour ce service à {pub}. Réduisez le nombre de personnes ou choisissez une autre heure.",
    fullNone: "Complet pour ce service à {pub}. Choisissez une autre heure ou appelez le pub.",
    pubs: "Cochez au moins un pub.", bot: "Le formulaire a été envoyé trop vite ou a expiré. Rechargez la page et réessayez.",
    csrf: "Votre session a expiré. Rechargez la page et réessayez.", rate: "Trop de demandes en peu de temps. Réessayez dans quelques minutes.",
    notFound: "Page introuvable", notFoundText: "Ce lien n'existe pas ou a expiré.", server: "Une erreur est survenue", serverText: "Réessayez dans un instant. Si le problème continue, appelez directement le pub.", home: "Retour à l'accueil"
  },
  footer: { tagline: "Pubs de quartier à Genève. Bières pression, cuisine maison et sport en direct.", legal: "Mentions légales", privacy: "Protection des données", alcohol: "Vente d'alcool interdite aux moins de 16 ans (bière, vin) et de 18 ans (spiritueux).", soon: "Ouverture prochaine" },
  mail: {
    hello: "Bonjour {name},", team: "L'équipe du Pub Goudale",
    resaReceivedSubj: "Demande de réservation reçue · {pub}", resaReceived: "Nous avons bien reçu votre demande pour {n} personne(s) le {date} à {time} à {pub}. Vous recevez une confirmation dès que le pub l'a validée.",
    resaConfirmedSubj: "Réservation confirmée · {pub}", resaConfirmed: "Votre table pour {n} personne(s) le {date} à {time} à {pub} est confirmée. À bientôt !",
    resaDeclinedSubj: "Réservation non disponible · {pub}", resaDeclined: "Désolés, {pub} ne peut pas vous accueillir le {date} à {time}. Essayez un autre créneau ou appelez-nous.",
    follow: "Suivre ou annuler ma réservation",
    smsConfirmed: "Pub Goudale {pub} : votre table pour {n} le {date} à {time} est confirmée. Annuler : {link}",
    smsDeclined: "Pub Goudale {pub} : désolés, nous ne pouvons pas vous accueillir le {date} à {time}. Appelez-nous au {tel}.",
    smsReminder: "Pub Goudale {pub} : rappel de votre table pour {n} demain à {time}. Empêchement ? {link}",
    groupSubj: "Votre demande de groupe · {pub}", group: "Merci ! {pub} a bien reçu votre demande pour {n} personnes. Nous vous recontactons rapidement avec une offre.",
    newsConfirmSubj: "Confirmez votre inscription · Pub Goudale", newsConfirm: "Cliquez sur le bouton pour confirmer votre inscription au menu du lundi. Si vous n'avez rien demandé, ignorez cet e-mail.", newsConfirmBtn: "Confirmer mon inscription",
    loyaltySubj: "Votre carte fidélité Pub Goudale", loyalty: "Voici votre carte fidélité : montrez le code au comptoir à chaque pression. La 10e est offerte.", loyaltyBtn: "Ouvrir ma carte",
    openingSubj: "Soirée d'ouverture Goudale Concorde", opening: "Merci {name} ! Vous êtes inscrit(e) pour {n} personne(s). Nous vous envoyons la date et l'heure dès qu'elles sont fixées.",
    unsubscribe: "Se désinscrire", why: "Vous recevez cet e-mail suite à votre demande sur le site du Pub Goudale."
  }
};
