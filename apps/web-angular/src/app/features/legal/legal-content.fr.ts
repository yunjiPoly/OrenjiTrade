/**
 * French versions of the legal documents (Québec, Bill 96 / Loi 96).
 *
 * TRADUCTION DE L’ÉBAUCHE ANGLAISE. Every text here is a careful translation of the English
 * draft in `legal-content.ts`, never new legal content: the English draft is the source, the
 * two share one version, and a lawyer must validate the translation before launch. Keep the
 * keys, section ids and clause counts aligned with the English file (a spec checks it).
 *
 * Typography (OQLF, Quebec usage): a non-breaking space (`\u00a0` escape) before a colon and
 * inside « guillemets », no space before ; ! ? — a spec checks it. Typographic apostrophes (’).
 *
 * Plain TypeScript (types only from `./legal-content`) so it can be copied to the mobile app
 * later like the English file.
 */
import type { LegalDefinition, LegalDocument, LegalKey } from './legal-content';

export const LEGAL_DRAFT_BANNER_FR =
  'Ébauche — doit être révisée par un conseiller juridique qualifié avant le lancement en production';

/** Shown under the draft banner on French pages. */
export const LEGAL_TRANSLATION_NOTICE_FR =
  'Traduction de l’ébauche anglaise, à faire valider par un conseiller juridique.';

export const LEGAL_EFFECTIVE_DATE_PLACEHOLDER_FR =
  '[Date d’entrée en vigueur à fixer au lancement]';

const CONTACT_LEGAL_FR =
  'Questions sur ce document\u00a0: legal@orenjitrade.com (Service juridique d’OrenjiTrade).';
const CONTACT_PRIVACY_FR =
  'Demandes et questions relatives aux renseignements personnels\u00a0: privacy@orenjitrade.com (Responsable de la protection des renseignements personnels d’OrenjiTrade).';
const CONTACT_SUPPORT_FR = 'Questions\u00a0: support@orenjitrade.com (Soutien OrenjiTrade).';

const COMMON_DEFINITIONS_FR: LegalDefinition[] = [
  {
    term: 'OrenjiTrade',
    definition:
      'L’application Web OrenjiTrade à l’adresse www.orenjitrade.com, les applications mobiles OrenjiTrade et les API connexes, collectivement le «\u00a0Service\u00a0».',
  },
  {
    term: 'Collectionneur',
    definition:
      'Un utilisateur inscrit au Service, qu’il publie des cartes, en cherche, ou les deux.',
  },
  {
    term: 'Cartable',
    definition:
      'Un ensemble d’articles d’inventaire qu’un Collectionneur regroupe. Un Cartable peut être privé, public ou temporairement public.',
  },
  {
    term: 'Annonce',
    definition:
      'Un article d’inventaire visible publiquement, avec son état, sa disponibilité (échange, vente, offres) et la province ou l’État de son propriétaire.',
  },
  {
    term: 'Localisation',
    definition:
      'Le pays et la province ou l’État qu’un Collectionneur déclare, avec une ville facultative. OrenjiTrade n’utilise jamais le GPS, la localisation de l’appareil, l’adresse IP ni le géocodage pour situer un Collectionneur.',
  },
];

const LAST_UPDATED = '2026-10-08';

export const LEGAL_DOCUMENTS_FR: Record<LegalKey, LegalDocument> = {
  terms: {
    key: 'terms',
    title: 'Conditions d’utilisation',
    shortTitle: 'Conditions',
    summary:
      'L’entente entre vous et OrenjiTrade pour l’utilisation de la carte, de l’inventaire, de la messagerie et des fonctions d’échange.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: COMMON_DEFINITIONS_FR,
    contact: CONTACT_LEGAL_FR,
    sections: [
      {
        id: 'acceptance',
        heading: 'Acceptation des présentes conditions',
        clauses: [
          'En créant un compte ou en utilisant le Service, vous acceptez les présentes Conditions d’utilisation, la Politique de confidentialité, les Règles de la communauté et la Politique d’utilisation acceptable.',
          'Vous devez avoir 18 ans ou plus pour créer un compte ou utiliser le Service. OrenjiTrade ne s’adresse pas aux mineurs. Lorsque vous créez un compte, vous confirmez avoir 18 ans ou plus; nous enregistrons cette confirmation et sa date. Nous fermons les comptes dont nous constatons qu’ils appartiennent à des personnes de moins de 18 ans.',
          'Nous enregistrons la version des présentes conditions que vous avez acceptée et la date de cette acceptation. Les modifications importantes sont annoncées dans l’application au moins 14 jours avant leur entrée en vigueur.',
        ],
      },
      {
        id: 'accounts',
        heading: 'Comptes et identité',
        clauses: [
          'Les comptes sont personnels. Vous êtes responsable de l’activité de votre compte et de la sécurité de votre méthode de connexion.',
          'Vous ne pouvez pas créer de compte pour contourner une suspension, usurper l’identité d’une autre personne ou présenter faussement votre affiliation à un commerce ou à une organisation.',
          'Nous pouvons suspendre ou fermer les comptes qui enfreignent les présentes conditions, les Règles de la communauté ou la loi applicable, sous réserve du processus d’appel décrit dans les Règles de la communauté.',
        ],
      },
      {
        id: 'nature-of-service',
        heading: 'Ce qu’OrenjiTrade est et n’est pas',
        clauses: [
          'OrenjiTrade est un lieu de découverte et de messagerie\u00a0: il aide les Collectionneurs à trouver qui, près d’eux, possède, échange, vend, recherche ou accepte des offres pour une carte, et leur permet de se parler. Les Collectionneurs traitent directement entre eux.',
          'OrenjiTrade n’est partie à aucun échange, aucune vente ni aucune rencontre entre Collectionneurs, ne détient aucun titre de propriété sur les cartes et n’offre aucun service de gradation, d’authentification ou d’évaluation.',
          'Les Collectionneurs sont responsables de leurs propres échanges et rencontres\u00a0: ce dont ils conviennent, où et comment ils se rencontrent, comment ils paient et ce qu’ils remettent. Lisez la page «\u00a0Échanger en toute sécurité\u00a0» avant de rencontrer ou de payer un autre Collectionneur.',
          'Lorsque des fonctions de paiement sont activées, elles sont fournies par un fournisseur de services de paiement tiers selon la Politique de protection des paiements. OrenjiTrade n’exploite pas de service d’entiercement (escrow).',
        ],
      },
      {
        id: 'content',
        heading: 'Votre contenu et la licence',
        clauses: [
          'Vous conservez la propriété des photos, des descriptions et des messages que vous soumettez. Vous accordez à OrenjiTrade une licence mondiale, non exclusive et libre de redevances pour héberger, afficher et distribuer ce contenu aux fins de l’exploitation du Service.',
          'Vous confirmez avoir le droit de publier les cartes que vous publiez et que votre contenu ne porte pas atteinte aux droits de tiers.',
          'Les noms de cartes, les noms de séries, les illustrations et les marques de commerce appartiennent à leurs éditeurs respectifs. OrenjiTrade n’est ni affilié à un éditeur de cartes à collectionner ni approuvé par lui.',
        ],
      },
      {
        id: 'location',
        heading: 'Localisation et repérabilité',
        clauses: [
          'La repérabilité est désactivée par défaut et exige une Localisation. Lorsque vous l’activez, les autres Collectionneurs voient seulement votre province ou votre État et votre pays; votre ville n’apparaît que sur votre propre profil, et seulement si vous choisissez de l’afficher.',
          'Vous pouvez modifier ou supprimer votre Localisation en tout temps dans Paramètres → Localisation. La supprimer vous retire de la carte et des recherches.',
        ],
      },
      {
        id: 'liability',
        heading: 'Exclusions de garantie et limitation de responsabilité',
        clauses: [
          'Le Service est fourni «\u00a0tel quel\u00a0» et «\u00a0selon la disponibilité\u00a0». Dans la mesure permise par la loi, OrenjiTrade décline toute garantie, expresse ou implicite.',
          'Dans la mesure permise par la loi, OrenjiTrade n’est pas responsable des dommages indirects, accessoires ou consécutifs, ni des pertes découlant des rapports entre Collectionneurs, y compris les échanges, les ventes et les rencontres en personne.',
          'Rien dans les présentes conditions ne limite ni n’exclut une responsabilité qui ne peut être limitée ou exclue en vertu de la loi applicable, notamment la législation sur la protection du consommateur.',
        ],
      },
      {
        id: 'termination',
        heading: 'Résiliation et suppression du compte',
        clauses: [
          'Vous pouvez supprimer votre compte en tout temps dans les Paramètres. La suppression retire ou anonymise vos renseignements personnels comme le décrit la Politique de confidentialité, sous réserve des obligations légales de conservation.',
          'Les articles qui, par leur nature, doivent survivre à la résiliation (licence sur le contenu pour l’activité passée, responsabilité, droit applicable) survivent.',
        ],
      },
      {
        id: 'governing-law',
        heading: 'Droit applicable et modifications',
        clauses: [
          '[Droit applicable et tribunal compétent à confirmer par le conseiller juridique.] Les règles impératives de protection du consommateur de votre pays de résidence continuent de s’appliquer.',
          'Nous pouvons mettre à jour les présentes conditions. La version en vigueur est toujours accessible à l’adresse www.orenjitrade.com/legal/terms avec sa date d’entrée en vigueur.',
        ],
      },
    ],
  },

  privacy: {
    key: 'privacy',
    title: 'Politique de confidentialité',
    shortTitle: 'Confidentialité',
    summary:
      'Ce que nous recueillons, pourquoi, combien de temps nous le conservons et les choix qui s’offrent à vous.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: [
      ...COMMON_DEFINITIONS_FR,
      {
        term: 'Renseignement personnel',
        definition: 'Tout renseignement qui concerne une personne identifiée ou identifiable.',
      },
      {
        term: 'Lieu public',
        definition:
          'La province ou l’État et le pays de votre Localisation\u00a0: tout ce que les autres Collectionneurs voient de l’endroit où vous êtes. La carte compte les Cartables publics par province ou État. Votre ville n’est affichée que sur votre propre profil, et seulement si vous le choisissez.',
      },
    ],
    contact: CONTACT_PRIVACY_FR,
    sections: [
      {
        id: 'privacy-officer',
        heading: 'Responsable de la protection des renseignements personnels',
        clauses: [
          'Notre Responsable de la protection des renseignements personnels / Privacy Officer est [nom à confirmer], [titre à confirmer], que vous pouvez joindre à privacy@orenjitrade.com [adresse postale à confirmer]. Cette personne veille à la façon dont OrenjiTrade recueille, utilise, conserve et communique les renseignements personnels, et traite les demandes et les plaintes à ce sujet.',
        ],
      },
      {
        id: 'data-we-collect',
        heading: 'Renseignements que nous recueillons',
        clauses: [
          'Données du compte\u00a0: adresse courriel, nom d’affichage, avatar, jeux suivis et étiquettes choisies. La connexion est gérée par notre fournisseur d’identité; nous ne voyons jamais votre mot de passe.',
          'Données d’inventaire\u00a0: les cartes, les états, les prix et la disponibilité que vous enregistrez, ainsi que la visibilité que vous attribuez à chaque Cartable.',
          'Données de localisation\u00a0: uniquement le pays, la province ou l’État et la ville facultative que vous déclarez. Nous ne recueillons ni GPS ni localisation de l’appareil, nous ne déduisons pas votre localisation de votre adresse IP et nous ne vous suivons pas en arrière-plan.',
          'Données d’utilisation\u00a0: type d’appareil, version de l’application, journaux de diagnostic identifiés par un identifiant de requête, et événements d’analyse du produit qui ne contiennent jamais de localisation précise ni de contenu de messages.',
          'Communications\u00a0: messages privés, publications dans les canaux communautaires, offres, évaluations et signalements que vous soumettez.',
        ],
      },
      {
        id: 'purposes',
        heading: 'Pourquoi nous les utilisons',
        clauses: [
          'Pour exploiter le Service\u00a0: afficher vos Cartables publics sur la carte, apparier les listes de souhaits, livrer les messages et les notifications.',
          'Pour la sécurité de la communauté\u00a0: détecter les abus, traiter les signalements, faire respecter les Règles de la communauté et nous conformer à nos obligations légales.',
          'Pour améliorer le produit à l’aide d’analyses agrégées. Nous ne vendons pas de renseignements personnels et nous ne les utilisons pas pour des profils publicitaires de tiers.',
        ],
      },
      {
        id: 'location-privacy',
        heading: 'Confidentialité de la localisation',
        clauses: [
          'Nous ne conservons aucune coordonnée géographique. La carte est dessinée à partir de données publiques de frontières (Natural Earth) et compte les Cartables publics par province ou État; aucune épingle, aucun point ni aucune distance n’est jamais affiché pour un Collectionneur.',
          'Votre ville est un texte libre que nous ne géocodons jamais. Elle n’est affichée que sur votre propre profil public tant que «\u00a0Afficher ma ville sur mon profil\u00a0» est activé, et jamais dans les résultats de recherche, les Cartables, les offres, les messages, les notifications, les analyses ni rien de ce qui est partagé avec d’autres.',
          'Vous pouvez modifier ou supprimer votre Localisation en tout temps dans Paramètres → Localisation; la supprimer désactive la repérabilité.',
        ],
      },
      {
        id: 'sharing',
        heading: 'À qui nous communiquons des renseignements',
        clauses: [
          'Les fournisseurs de services qui hébergent et exploitent le Service pour notre compte (infrastructure infonuagique, fournisseur d’identité, livraison des notifications poussées, fournisseur de paiement lorsqu’il est activé), liés par des ententes de traitement des données.',
          'Les autres Collectionneurs, dans la limite de ce que vous rendez public\u00a0: nom d’affichage, avatar, Cartables publics, évaluations, votre Lieu public et votre ville sur votre profil si vous choisissez de l’afficher.',
          'Les autorités, lorsque la loi l’exige ou pour protéger les droits et la sécurité des Collectionneurs.',
        ],
      },
      {
        id: 'retention',
        heading: 'Conservation et suppression',
        clauses: [
          'Les données du compte et de l’inventaire sont conservées tant que votre compte est actif. Lorsque vous supprimez votre compte, nous retirons ou anonymisons les renseignements personnels dans les 30 jours, sauf les dossiers que nous devons conserver pour des motifs légaux, de litige ou de sécurité.',
          'Les journaux de diagnostic sont conservés pendant une période limitée [à confirmer] et les analyses sont conservées sous forme agrégée.',
        ],
      },
      {
        id: 'your-rights',
        heading: 'Vos droits et comment les exercer',
        clauses: [
          'Vous avez le droit d’accéder aux renseignements personnels que nous détenons à votre sujet, de les faire rectifier s’ils sont inexacts, incomplets ou équivoques, d’en recevoir une copie et d’en demander la suppression. Selon votre lieu de résidence, vous pouvez aussi avoir le droit de restreindre certains traitements ou de vous y opposer.',
          'Accès et rectification\u00a0: votre profil, vos jeux, vos étiquettes, votre localisation, vos choix de confidentialité et de notifications sont affichés et modifiables dans les Paramètres (Profil, Confidentialité, Localisation, Notifications). Une copie de vos données est offerte dans Paramètres → Compte («\u00a0Exporter mes données\u00a0»).',
          'Suppression\u00a0: Paramètres → Compte («\u00a0Supprimer mon compte\u00a0») lance la suppression. Un délai de grâce de 7 jours vous permet de l’annuler; ensuite, vos renseignements personnels sont supprimés ou anonymisés dans les 30 jours, sauf ce que nous devons conserver pour des motifs légaux, de litige ou de sécurité (voir Conservation).',
          'Vous pouvez aussi écrire à privacy@orenjitrade.com. Nous répondons dans les 30 jours de la réception de votre demande, sans frais, et nous expliquons les motifs lorsque nous ne pouvons pas y donner suite ainsi que la façon de contester cette décision.',
          'Vous pouvez retirer votre consentement aux traitements facultatifs (comme les notifications poussées ou la repérabilité) en tout temps, sans que cela n’affecte la licéité des traitements antérieurs.',
          'Si notre réponse ne vous satisfait pas, vous pouvez déposer une plainte auprès de la Commission d’accès à l’information du Québec ou de l’autorité de protection de la vie privée de votre lieu de résidence.',
        ],
      },
      {
        id: 'incidents',
        heading: 'Incidents de confidentialité',
        clauses: [
          'Un incident de confidentialité est la perte d’un renseignement personnel, ou l’accès, l’utilisation ou la communication non autorisés d’un tel renseignement. Nous tenons un registre de tous les incidents de confidentialité, qu’ils aient dû être déclarés ou non.',
          'Lorsqu’un incident présente un risque de préjudice sérieux pour les personnes concernées, nous avisons la Commission d’accès à l’information du Québec et les personnes touchées dans les meilleurs délais, et nous prenons les mesures raisonnables pour diminuer le risque de préjudice et éviter que de nouveaux incidents de même nature ne se produisent.',
        ],
      },
      {
        id: 'international',
        heading: 'Lieu de conservation, communications hors du Québec et exigence d’âge',
        clauses: [
          'Notre base de données, les images téléversées et les analyses sont hébergées sur Google Cloud dans la région de Montréal (northamerica-northeast1, Québec), telle que configurée dans notre infrastructure [à confirmer au lancement].',
          'Certains fournisseurs de services peuvent conserver ou traiter des renseignements personnels à l’extérieur du Québec\u00a0: Firebase Authentication (Google; adresse courriel de connexion, empreinte du mot de passe, numéro de téléphone pour la double authentification du personnel, identifiants de fournisseurs; lieu de conservation [à confirmer]); Firebase Cloud Messaging (Google; jetons de notifications poussées; lieu de conservation [à confirmer]); Cloudflare (sécurité réseau et diffusion de contenu; adresses IP et journaux de requêtes à sa périphérie mondiale; lieu de conservation [à confirmer]); et, seulement lorsque les fonctions de paiement ou d’abonnement sont activées, Stripe (données de paiement, de versement et d’abonnement; États-Unis [à confirmer]). Avant de communiquer des renseignements personnels à l’extérieur du Québec, nous évaluons notamment s’ils bénéficieront d’une protection adéquate, y compris par des garanties contractuelles.',
          'Le Service s’adresse aux personnes de 18 ans et plus et ne vise pas les mineurs. Nous ne recueillons pas sciemment de renseignements personnels auprès de personnes de moins de 18 ans. Nous fermons les comptes dont nous constatons qu’ils appartiennent à des mineurs et supprimons leurs renseignements personnels, sous réserve des périodes de conservation décrites ci-dessus et de la loi.',
        ],
      },
    ],
  },

  'community-guidelines': {
    key: 'community-guidelines',
    title: 'Règles de la communauté',
    shortTitle: 'Communauté',
    summary:
      'Comment les Collectionneurs doivent se traiter entre eux sur la carte, dans le clavardage et dans les échanges.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: COMMON_DEFINITIONS_FR,
    contact: CONTACT_SUPPORT_FR,
    sections: [
      {
        id: 'respect',
        heading: 'Soyez respectueux',
        clauses: [
          'Pas de harcèlement, de propos haineux, de menaces ni de discrimination. Les désaccords sur la valeur ou l’état d’une carte sont normaux; les attaques personnelles ne le sont pas.',
          'Ne partagez pas les renseignements personnels, la localisation précise ou les messages privés d’un autre Collectionneur sans son consentement.',
        ],
      },
      {
        id: 'honesty',
        heading: 'Soyez honnête au sujet de vos cartes',
        clauses: [
          'Décrivez l’état avec exactitude selon l’échelle commune (de Mint à Endommagée). Déclarez les altérations, les répliques, les proxys et les dommages.',
          'Gardez votre inventaire à jour. Les Annonces non confirmées depuis 45 jours sont masquées automatiquement jusqu’à ce que vous les confirmiez.',
          'Ne publiez pas d’Annonces pour des cartes que vous n’avez pas en main ou que vous ne pouvez pas livrer.',
        ],
      },
      {
        id: 'safety',
        heading: 'Rencontrez-vous et échangez en toute sécurité',
        clauses: [
          'Pour les échanges en personne, donnez-vous rendez-vous dans des lieux publics achalandés, de jour, et faites-vous accompagner pour les cartes de valeur. Ne cédez jamais à la pression de communiquer votre adresse domiciliaire; la carte n’affiche jamais que des provinces et des États, jamais des positions. La page «\u00a0Échanger en toute sécurité\u00a0» donne des conseils pratiques.',
          'Utilisez les outils d’offre et de messagerie de l’application afin qu’il reste une trace si quelque chose tourne mal.',
          'Signalez tout comportement suspect avec le bouton Signaler le collectionneur. Les signalements sont examinés par les modérateurs et ne sont jamais montrés au Collectionneur signalé. Vous pouvez aussi bloquer un Collectionneur depuis son profil ou depuis le menu de la conversation.',
        ],
      },
      {
        id: 'channels',
        heading: 'Canaux communautaires',
        clauses: [
          'Restez dans le sujet\u00a0: les canaux de jeu sont réservés à ce jeu, les canaux «\u00a0recherche\u00a0» aux cartes recherchées, «\u00a0nouvelles annonces\u00a0» à ce que vous venez de publier.',
          'Pas de pourriel, de publications croisées répétées ni de publicité non sollicitée. Le contenu commandité est identifié par OrenjiTrade et n’est jamais publié par des comptes ordinaires.',
        ],
      },
      {
        id: 'enforcement',
        heading: 'Application des règles et appels',
        clauses: [
          'Les modérateurs peuvent retirer du contenu, masquer des Annonces, restreindre la messagerie ou suspendre des comptes. Chaque mesure est consignée et son motif est affiché au Collectionneur visé.',
          'Vous pouvez faire appel d’une décision de modération à partir de la notification reçue. Les appels sont examinés par un autre modérateur lorsque c’est possible.',
        ],
      },
    ],
  },

  'marketplace-policy': {
    key: 'marketplace-policy',
    title: 'Politique du marché',
    shortTitle: 'Marché',
    summary:
      'Règles sur les annonces, les offres, les prix et ce qui peut être échangé ou vendu sur OrenjiTrade.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: [
      ...COMMON_DEFINITIONS_FR,
      {
        term: 'Offre',
        definition:
          'Une proposition d’un Collectionneur à un autre pour une carte ou un ensemble de cartes, en argent, en échange ou en combinaison des deux. Les offres passent par les états ouverte, contre-proposée, acceptée, refusée, annulée et expirée.',
      },
    ],
    contact: CONTACT_SUPPORT_FR,
    sections: [
      {
        id: 'permitted-items',
        heading: 'Ce qui peut être publié',
        clauses: [
          'Des cartes à collectionner physiques et des produits scellés pour les jeux pris en charge par OrenjiTrade.',
          'Non permis\u00a0: les contrefaçons ou reproductions sans licence présentées comme authentiques, les biens volés, les codes numériques obtenus en violation des conditions de l’éditeur, et tout ce dont la vente est illégale selon les lois qui vous sont applicables.',
        ],
      },
      {
        id: 'listing-standards',
        heading: 'Normes des annonces',
        clauses: [
          'Chaque Annonce indique un état, une langue, une édition ou une impression, et une disponibilité (collection seulement, échange, vente, échange ou vente, offres acceptées, non disponible).',
          'Les prix sont fixés par le Collectionneur dans sa devise locale. OrenjiTrade ne fixe, ne suggère ni ne garantit aucun prix.',
          'Les photos doivent montrer la carte réellement annoncée. Des images de catalogue peuvent s’ajouter aux vraies photos, sans les remplacer, lorsqu’une carte est à vendre.',
        ],
      },
      {
        id: 'offers',
        heading: 'Offres et engagements',
        clauses: [
          'Une offre acceptée est un engagement entre les deux Collectionneurs. Ne pas honorer à répétition des offres acceptées peut entraîner des pénalités d’évaluation ou une suspension.',
          'Les offres expirent automatiquement après le délai indiqué sur l’offre. Une contre-offre remplace l’offre précédente.',
        ],
      },
      {
        id: 'fees',
        heading: 'Frais et forfaits',
        clauses: [
          'La publication et la consultation sont gratuites dans les limites de votre forfait. Les limites et les avantages premium sont affichés dans les Paramètres et peuvent changer moyennant préavis.',
          'Lorsque les paiements protégés sont activés, les frais applicables sont affichés avant que vous ne confirmiez un paiement.',
        ],
      },
      {
        id: 'delisting',
        heading: 'Retrait automatique',
        clauses: [
          'Les Annonces affichent un état de fraîcheur\u00a0: Récente (mise à jour depuis 14 jours ou moins), Vieillissante (15 à 30 jours), Périmée (31 à 45 jours). Après 45 jours sans confirmation, une Annonce est masquée jusqu’à ce que vous confirmiez qu’elle est toujours disponible.',
          'Vous recevez des avertissements avant qu’une Annonce ne soit masquée et vous pouvez la rétablir en tout temps.',
        ],
      },
    ],
  },

  'payment-protection': {
    key: 'payment-protection',
    title: 'Politique de protection des paiements',
    shortTitle: 'Paiements',
    summary:
      'Comment fonctionnent les transactions protégées lorsque les paiements sont activés, et ce qui est couvert ou non.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: [
      ...COMMON_DEFINITIONS_FR,
      {
        term: 'Fournisseur de paiement',
        definition:
          'Le service de paiement tiers autorisé qui traite les paiements par carte et les versements pour le compte des Collectionneurs. OrenjiTrade ne conserve jamais de numéros de carte.',
      },
      {
        term: 'Transaction protégée',
        definition:
          'Une vente payée par l’intermédiaire du Service où le versement au vendeur n’est libéré qu’après la confirmation de réception par l’acheteur ou la fin du délai de litige.',
      },
    ],
    contact: CONTACT_SUPPORT_FR,
    sections: [
      {
        id: 'availability',
        heading: 'Disponibilité',
        clauses: [
          'Les transactions protégées sont une fonction facultative qui peut être activée par région. Lorsque la fonction est désactivée, les Collectionneurs règlent les paiements directement entre eux et la présente politique ne s’applique pas.',
          'Le traitement des paiements est assuré par le Fournisseur de paiement selon ses propres conditions, que vous acceptez lors de votre première transaction protégée.',
        ],
      },
      {
        id: 'flow',
        heading: 'Déroulement d’une transaction protégée',
        clauses: [
          'L’acheteur paie par l’intermédiaire du Service. Le vendeur expédie et enregistre le suivi. L’acheteur confirme la réception, après quoi le versement est libéré au vendeur.',
          'Si l’acheteur ne confirme pas ou n’ouvre pas de litige dans le délai indiqué à la caisse, le versement est libéré automatiquement.',
        ],
      },
      {
        id: 'coverage',
        heading: 'Ce qui est couvert',
        clauses: [
          'Article non reçu, article sensiblement différent de l’Annonce (mauvaise carte, mauvaise impression, état nettement inférieur à l’état déclaré).',
          'Non couvert\u00a0: les échanges en personne, les paiements effectués hors du Service, les regrets de l’acheteur, ou les désaccords mineurs sur l’état à l’intérieur d’un même grade.',
        ],
      },
      {
        id: 'limits',
        heading: 'Limites et exclusions',
        clauses: [
          'La couverture est limitée au montant payé par l’intermédiaire du Service pour l’article contesté, y compris les frais d’expédition payés par l’intermédiaire du Service.',
          'OrenjiTrade n’offre ni entiercement (escrow), ni assurance, ni service de paiement réglementé; la protection est une fonction du déroulement de la transaction exploitée avec le Fournisseur de paiement.',
        ],
      },
    ],
  },

  'refund-dispute': {
    key: 'refund-dispute',
    title: 'Politique de remboursement et de règlement des litiges',
    shortTitle: 'Remboursements',
    summary:
      'Comment ouvrir un litige, quelles preuves sont utiles et comment les décisions sont prises.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: [
      ...COMMON_DEFINITIONS_FR,
      {
        term: 'Litige',
        definition:
          'Une demande formelle d’un acheteur ou d’un vendeur de réviser une transaction protégée, ouverte depuis l’écran de l’échange pendant le délai de litige.',
      },
    ],
    contact: CONTACT_SUPPORT_FR,
    sections: [
      {
        id: 'opening',
        heading: 'Ouvrir un litige',
        clauses: [
          'Ouvrez un litige depuis l’écran de l’échange pendant le délai de litige indiqué sur l’échange. Choisissez un motif et décrivez le problème.',
          'Avant d’ouvrir un litige, écrivez à l’autre Collectionneur; la plupart des problèmes se règlent directement.',
        ],
      },
      {
        id: 'evidence',
        heading: 'Preuves',
        clauses: [
          'Les preuves utiles comprennent des photos de la carte reçue et de l’emballage, le relevé de suivi et l’historique des messages. Les preuves sont soumises dans le litige et sont visibles par les deux parties et par le réviseur.',
          'Ne soumettez pas de preuves que vous n’avez pas le droit de partager. Des preuves fabriquées entraînent la suspension du compte.',
        ],
      },
      {
        id: 'review',
        heading: 'Révision et décision',
        clauses: [
          'Un réviseur examine l’Annonce, les preuves et l’historique des messages, puis tranche en faveur de l’acheteur, du vendeur ou d’un remboursement partiel. Les décisions sont habituellement rendues dans les 10 jours ouvrables.',
          'Les remboursements sont émis par le Fournisseur de paiement vers le moyen de paiement d’origine. Un remboursement partiel est possible lorsque la carte a été reçue mais ne correspondait pas à l’Annonce.',
        ],
      },
      {
        id: 'appeals',
        heading: 'Appels',
        clauses: [
          'Chaque partie peut faire appel une fois, dans les 7 jours de la décision, avec de nouvelles preuves. Les appels sont examinés par un autre réviseur lorsque c’est possible.',
          'La présente politique ne limite pas vos droits prévus par la loi, y compris les droits de rétrofacturation auprès de l’émetteur de votre carte.',
        ],
      },
    ],
  },

  cookies: {
    key: 'cookies',
    title: 'Politique relative aux témoins (cookies)',
    shortTitle: 'Témoins',
    summary:
      'Les témoins et le stockage local utilisés par l’application Web, et comment les contrôler.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: [
      {
        term: 'Témoin (cookie)',
        definition:
          'Un petit fichier texte enregistré par votre navigateur. Nous utilisons aussi le stockage local du navigateur, qui fonctionne de façon semblable mais n’est pas envoyé automatiquement aux serveurs.',
      },
      {
        term: 'Strictement nécessaire',
        definition:
          'Un stockage sans lequel le Service ne peut pas fonctionner (session de connexion, sécurité).',
      },
    ],
    contact: CONTACT_PRIVACY_FR,
    sections: [
      {
        id: 'what-we-use',
        heading: 'Ce que nous utilisons',
        clauses: [
          'Strictement nécessaire\u00a0: les jetons de session du fournisseur d’identité (pour maintenir votre session ouverte) et les jetons de sécurité qui protègent contre la falsification de requêtes.',
          'Préférences\u00a0: votre thème (clair, sombre ou système), la langue des pages juridiques, les avis que vous avez fermés et les réglages semblables, conservés dans le stockage local et jamais envoyés à nos serveurs.',
          'Analyse\u00a0: des analyses de produit de première partie qui n’incluent ni localisation précise ni contenu de messages. [Confirmer si un consentement est requis dans les régions visées.]',
        ],
      },
      {
        id: 'third-parties',
        heading: 'Services de tiers',
        clauses: [
          'Les tuiles de carte (Google Maps ou OpenStreetMap) et les polices Web sont chargées depuis leurs fournisseurs, qui peuvent déposer leurs propres témoins selon leurs propres politiques.',
          'Lorsque les paiements protégés sont activés, le Fournisseur de paiement dépose les témoins nécessaires à la prévention de la fraude.',
        ],
      },
      {
        id: 'controls',
        heading: 'Vos contrôles',
        clauses: [
          'Vous pouvez effacer ou bloquer le stockage dans les réglages de votre navigateur. Bloquer le stockage strictement nécessaire vous déconnectera et peut empêcher certaines parties du Service de fonctionner.',
          'Lorsqu’une bannière de consentement est affichée, vous pouvez modifier votre choix en tout temps à partir du lien «\u00a0Témoins\u00a0» du pied de page.',
        ],
      },
    ],
  },

  'acceptable-use': {
    key: 'acceptable-use',
    title: 'Politique d’utilisation acceptable',
    shortTitle: 'Utilisation acceptable',
    summary:
      'Les limites techniques et comportementales qui protègent le Service et ses Collectionneurs.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: COMMON_DEFINITIONS_FR,
    contact: CONTACT_LEGAL_FR,
    sections: [
      {
        id: 'prohibited-conduct',
        heading: 'Conduites interdites',
        clauses: [
          'Tenter de déterminer la localisation précise ou l’adresse d’un autre Collectionneur, notamment en combinant son profil, ses annonces, ses messages ou son activité à travers plusieurs requêtes ou plusieurs comptes.',
          'Moissonner, explorer ou exporter en masse des Annonces, des profils ou des données de la carte, ou utiliser le Service pour constituer un jeu de données concurrent.',
          'Contourner les limites de débit, les limites de forfait, les règles de fraîcheur ou les mesures de modération.',
          'Téléverser du code malveillant, sonder ou tester la sécurité du Service sans autorisation écrite, ou nuire à l’utilisation du Service par d’autres Collectionneurs.',
        ],
      },
      {
        id: 'automation',
        heading: 'Automatisation et utilisation de l’API',
        clauses: [
          'L’automatisation personnelle qui n’agit que sur votre propre compte et respecte les limites de débit est permise. L’envoi automatisé de messages ou d’offres à d’autres Collectionneurs ne l’est pas.',
          'L’accès à l’API est réservé aux applications officielles. Les clients tiers nécessitent une permission écrite.',
        ],
      },
      {
        id: 'reporting',
        heading: 'Signaler une vulnérabilité',
        clauses: [
          'Si vous découvrez un problème de sécurité, signalez-le à security@orenjitrade.com. Nous vous demandons d’éviter d’accéder aux données d’autres Collectionneurs et de nous laisser un délai raisonnable pour corriger le problème avant toute divulgation.',
        ],
      },
      {
        id: 'consequences',
        heading: 'Conséquences',
        clauses: [
          'Les manquements peuvent entraîner le retrait de contenu, des restrictions de fonctions, une suspension ou une fermeture de compte et, s’il y a lieu, un renvoi aux autorités policières.',
        ],
      },
    ],
  },

  'trading-safely': {
    key: 'trading-safely',
    title: 'Échanger en toute sécurité',
    shortTitle: 'Échanger en sécurité',
    summary:
      'Conseils pratiques pour rencontrer d’autres collectionneurs et échanger avec eux, ce qu’OrenjiTrade montre à votre sujet, et comment signaler ou bloquer quelqu’un.',
    version: '0.1-draft',
    effectiveDate: null,
    lastUpdated: LAST_UPDATED,
    definitions: COMMON_DEFINITIONS_FR,
    contact: CONTACT_SUPPORT_FR,
    sections: [
      {
        id: 'before-you-meet',
        heading: 'Avant la rencontre',
        clauses: [
          'Donnez-vous rendez-vous dans un lieu public achalandé, de jour\u00a0: un café, un centre commercial, une boutique de cartes ou une bibliothèque. Certains postes de police offrent des zones d’échange sécuritaires; consultez le site Web de votre service de police local.',
          'Faites-vous accompagner lorsque les cartes ont de la valeur, et dites à un proche où vous allez et à quelle heure vous comptez revenir.',
          'Ne communiquez jamais votre adresse domiciliaire, votre lieu de travail ni vos habitudes. OrenjiTrade n’affiche jamais que votre province ou votre État (et votre ville sur votre profil, si vous le choisissez), et vous contrôlez ce que vous publiez.',
          'Convenez des détails dans l’application avant la rencontre\u00a0: quelles cartes, quel état, quel prix ou quel échange, et comment vous paierez. La conversation et l’offre restent comme trace.',
        ],
      },
      {
        id: 'during-the-exchange',
        heading: 'Pendant l’échange',
        clauses: [
          'Vérifiez les cartes avant de remettre de l’argent ou vos propres cartes\u00a0: état, édition, impression et signes de contrefaçon. Prenez votre temps; un collectionneur de bonne foi s’y attend.',
          'Gardez l’échange simple\u00a0: une seule rencontre, en personne, cartes et paiement au même moment.',
          'Partez si quelque chose cloche. Vous n’avez jamais l’obligation de conclure un échange.',
        ],
      },
      {
        id: 'warning-signs',
        heading: 'Signaux d’alarme',
        clauses: [
          'La pression pour décider tout de suite, pour se rencontrer dans un endroit isolé ou la nuit, ou pour poursuivre la conversation hors d’OrenjiTrade.',
          'Les offres qui semblent trop belles pour être vraies le sont généralement.',
          'Les demandes de paiement hors du mode convenu\u00a0: un acompte avant la rencontre, des cartes-cadeaux, des virements bancaires ou des cryptomonnaies pour «\u00a0réserver\u00a0» une carte.',
          'Les histoires qui changent, les comptes tout neufs sans historique, ou le refus de montrer la vraie carte.',
        ],
      },
      {
        id: 'what-we-show',
        heading: 'Ce qu’OrenjiTrade montre à votre sujet',
        clauses: [
          'Les autres collectionneurs voient votre province ou votre État et votre pays, jamais votre position exacte ni votre adresse. Votre ville n’apparaît que sur votre propre profil, si vous choisissez de l’afficher. Aucune distance n’est jamais affichée.',
          'La repérabilité est désactivée par défaut. Vous choisissez si vous apparaissez sur la carte, qui peut vous écrire et ce que vos cartables montrent, dans Paramètres → Confidentialité.',
        ],
      },
      {
        id: 'report-and-block',
        heading: 'Signaler et bloquer',
        clauses: [
          'Signalez un collectionneur depuis son profil, depuis le menu de la conversation ou depuis une publication communautaire («\u00a0Signaler le collectionneur\u00a0»). Choisissez un motif; les modérateurs examinent chaque signalement, et le collectionneur signalé n’apprend jamais qui l’a signalé.',
          'Bloquez un collectionneur depuis son profil ou depuis le menu de la conversation\u00a0: vous cessez de vous voir sur la carte, dans la recherche et dans la communauté, et aucun de vous deux ne peut écrire à l’autre. Gérez les blocages dans Paramètres → Utilisateurs bloqués.',
          'Si vous êtes en danger, communiquez d’abord avec les services d’urgence de votre région (le 911 au Canada).',
        ],
      },
      {
        id: 'payments',
        heading: 'Paiements',
        clauses: [
          'Au lancement, OrenjiTrade ne traite aucun paiement entre collectionneurs\u00a0: vous réglez vos échanges et vos ventes directement entre vous. OrenjiTrade n’est pas partie à vos échanges et ne peut pas les rembourser.',
          'Si vous payez, privilégiez un mode de paiement que vous pouvez vérifier sur place, et seulement après avoir vérifié les cartes.',
        ],
      },
    ],
  },
};

/** Documents in display order for indexes (same order as the English list). */
export const LEGAL_DOCUMENT_LIST_FR: readonly LegalDocument[] = (
  Object.keys(LEGAL_DOCUMENTS_FR) as LegalKey[]
).map((key) => LEGAL_DOCUMENTS_FR[key]);
