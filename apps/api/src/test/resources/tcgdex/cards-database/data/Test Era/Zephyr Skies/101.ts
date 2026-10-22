import { Card } from '../../../interfaces'
import Set from '../Zephyr Skies'

const card: Card = {
	set: Set,

	name: {
		en: "Spark Energy"
	},

	rarity: "None",
	category: "Energy",

	effect: {
		en: "This card provides 1 {L} Energy. /* not a comment */"
	},

	energyType: "Special",
	variants: {
		normal: true,
		reverse: false,
		holo: false,
		firstEdition: false
	}
}

export default card
