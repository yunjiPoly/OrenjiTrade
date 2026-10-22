import { Card } from '../../../interfaces'
import Set from '../Ember Rise'

const card: Card = {
	set: Set,

	name: {
		en: "Emberhound ex",
	},

	illustrator: "Atelier Orenji",
	rarity: "Double rare",
	category: "Pokemon",
	hp: 260,
	types: ["Fire"],
	evolveFrom: {
		en: "Emberpup"
	},
	stage: "Stage1",
	suffix: "EX",

	abilities: [{
		type: "Ability",
		name: {
			en: "Heat Shield"
		},
		effect: {
			en: `Prevent all damage done to this Pokémon by attacks from Water Pokémon.`
		}
	}],

	attacks: [{
		cost: ["Fire", "Fire"],
		name: { en: "Blaze Fang" },
		damage: 160
	}],

	weaknesses: [{ type: 'Water', value: '×2' }],
	retreat: 2,
	regulationMark: "H",
	variants: [
		{ type: 'holo' },
	],
}

export default card
