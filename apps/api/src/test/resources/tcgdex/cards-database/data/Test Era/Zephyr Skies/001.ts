import { Card } from '../../../interfaces'
import Set from '../Zephyr Skies'

const card: Card = {
	set: Set,

	name: {
		en: "Emberpup",
		fr: "Braisillon",
	},

	illustrator: "Atelier Orenji",
	rarity: "Common",
	category: "Pokemon",
	dexId: [9001],
	hp: 70,
	types: ["Fire"],
	stage: "Basic",

	attacks: [{
		cost: ["Fire"],
		name: {
			en: "Ember Nip",
			fr: "Mordillon",
		},
		damage: 20
	}],

	weaknesses: [{
		type: "Water",
		value: "×2"
	}],

	retreat: 1,
	regulationMark: "G",
	variants: {
		normal: true,
		reverse: true,
		holo: false,
		firstEdition: false
	}
}

export default card
