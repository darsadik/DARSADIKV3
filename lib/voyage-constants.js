export const COMMON_CHARGE_KEYS = new Set(['ouvriers','chauffeur','nourriture','autoroute','chargement','gendarmerie','reparation_camion','autres'])

export const FRAIS_LABELS = ['Transport', 'Déchargement', 'Location', "Main d'œuvre", 'Autre']

export const CHARGE_CATS = [
  { key: 'ouvriers',          label: 'Ouvriers / Main d\'œuvre', icon: '👷'  },
  { key: 'chauffeur',         label: 'Chauffeur',                icon: '🧑‍✈️' },
  { key: 'nourriture',        label: 'Nourriture',               icon: '🍽️' },
  { key: 'autoroute',         label: 'Autoroute / Péage',        icon: '🛣️'  },
  { key: 'gendarmerie',       label: 'Gendarmerie',              icon: '🚔' },
  { key: 'controle',          label: 'Contrôle / Police',        icon: '🛂' },
  { key: 'reparation_camion', label: 'Réparation camion',        icon: '🔧' },
  { key: 'pneus',             label: 'Pneus / Réparation',       icon: '🔩' },
  { key: 'chargement',        label: 'Chargement / Teb\'ia',     icon: '📦' },
  { key: 'lavage_vidange',    label: 'Lavage / Vidange',         icon: '🚿' },
  { key: 'transport',         label: 'Transport / Mrkob',        icon: '🚌' },
  { key: 'gardien',           label: 'Gardien / Sécurité',       icon: '💂' },
  { key: 'tractopelle',       label: 'Tractopelle / Trax',       icon: '🚜' },
  { key: 'balance',           label: 'Balance / Poids',          icon: '⚖️'  },
  { key: 'samsar',            label: 'Samsar / Courtage',        icon: '🤝' },
  { key: 'adblue',            label: 'AdBlue',                   icon: '🧴' },
  { key: 'autres',            label: 'Autres charges',           icon: '➕' },
]
