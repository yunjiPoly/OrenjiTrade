import { Card } from '../../../interfaces'
import Set from '../Ember Rise'

const card: Card = {
	set: Set,

	name: {
		en: "Emberpup",
		fr: "Braisillon",
	},

	illustrator: "Studio Mikan",
	rarity: "Uncommon",
	category: "Pokemon",
	hp: 80,
	types: ["Fire"],
	stage: "Basic",

	attacks: [{
		cost: ["Fire", "Colorless"],
		name: {
			en: "Flare Dash"
		},
		effect: {
			en: 'Flip a coin. If heads, this attack does 30 more damage.'
		},
		damage: "30+"
	}],

	weaknesses: [{ type: "Water", value: "×2" }],
	retreat: 1,
	regulationMark: "H",
	variants: {
		normal: false,
		reverse: false,
		holo: true,
		firstEdition: false
	}
}

export default card
