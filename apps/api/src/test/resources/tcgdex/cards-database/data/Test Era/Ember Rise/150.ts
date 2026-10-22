import { Card } from '../../../interfaces'
import Set from '../Ember Rise'

const card: Card = {
	set: Set,

	name: {
		en: "Professor’s Notes",
	},

	illustrator: "Studio Mikan",
	rarity: "Uncommon",
	category: "Trainer",

	effect: {
		en: "Draw 3 cards.",
	},

	trainerType: "Supporter",
	regulationMark: "H",
	variants: {
		normal: true,
		reverse: true,
		holo: false,
		firstEdition: false
	}
}

export default card
