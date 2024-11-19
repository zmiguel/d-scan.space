export async function load({ params }) {
	const { group, scan } = params;

	const scan_data = {
		type: 'local',
		alliances: [
			{
				name: 'Pandemic Horde',
				ticker: 'REKTD',
				corporations: [
					{
						name: 'A Blessed Bean',
						ticker: 'BLSFC',
						characters: [
							{
								name: 'Crukk',
								sec_status: 0
							},
							{
								name: 'darling77',
								sec_status: 0
							},
							{
								name: 'Aivo Korak',
								sec_status: 0
							},
							{
								name: 'Asanar Yanumano',
								sec_status: 0
							},
							{
								name: 'Bimahi Adoudel',
								sec_status: 0
							},
							{
								name: 'Amnarii',
								sec_status: 0
							},
							{
								name: 'Cildie',
								sec_status: 0
							},
							{
								name: 'Anthrea',
								sec_status: 0
							},
							{
								name: 'Adrakones',
								sec_status: 0
							},
							{
								name: "D'antonia E'squire",
								sec_status: 0
							}
						],
						character_count: 10
					},
					{
						name: "Gentlemen's Club.",
						ticker: 'GEMEC',
						characters: [
							{
								name: 'Daila Shatar',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Horde Armada',
						ticker: 'DDGRN',
						characters: [
							{
								name: 'Chase Reinhold',
								sec_status: 0
							},
							{
								name: 'Dagon Crow',
								sec_status: 0
							}
						],
						character_count: 2
					},
					{
						name: 'Arctic Guard',
						ticker: 'SPSFC',
						characters: [
							{
								name: 'BlackPony',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Lisnave',
						ticker: '.CRP.',
						characters: [
							{
								name: 'antonio Thiesant',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Blackwater USA Inc.',
						ticker: 'BUSA',
						characters: [
							{
								name: 'Devon Anzomi',
								sec_status: 0
							},
							{
								name: 'Destiny Anzomi',
								sec_status: 0
							},
							{
								name: 'Auereola',
								sec_status: 0
							},
							{
								name: 'Buzz Miner',
								sec_status: 0
							},
							{
								name: 'Attractive Nuisance',
								sec_status: 0
							}
						],
						character_count: 5
					},
					{
						name: '0.0 Massive Dynamic',
						ticker: '0MD',
						characters: [
							{
								name: 'Carraig Mactire',
								sec_status: 0
							},
							{
								name: 'Alisa Iverson',
								sec_status: 0
							},
							{
								name: 'Arhi Iverson',
								sec_status: 0
							},
							{
								name: 'Bell Craneld',
								sec_status: 0
							},
							{
								name: 'Blue Popsicle',
								sec_status: 0
							}
						],
						character_count: 5
					},
					{
						name: "GO' R0V",
						ticker: 'IDSKQ',
						characters: [
							{
								name: 'boriths sorenson',
								sec_status: 0
							},
							{
								name: 'Dennis Mernher',
								sec_status: 0
							},
							{
								name: 'Anastacia Mernher',
								sec_status: 0
							},
							{
								name: 'Anya Kilsh',
								sec_status: 0
							},
							{
								name: 'Ballo',
								sec_status: 0
							},
							{
								name: 'Daimona Terror',
								sec_status: 0
							},
							{
								name: 'Andemandse',
								sec_status: 0
							},
							{
								name: 'Decarpo Darko',
								sec_status: 0
							},
							{
								name: 'AndeBaby Kage Fluen',
								sec_status: 0
							}
						],
						character_count: 9
					},
					{
						name: 'Bohemian Veterans',
						ticker: '--BV-',
						characters: [
							{
								name: 'Caysey Trinitry',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Special Assault Unit',
						ticker: 'XSAUX',
						characters: [
							{
								name: "C'Lox",
								sec_status: 0
							},
							{
								name: 'Amila Panala',
								sec_status: 0
							},
							{
								name: 'Calique Veur Riraille',
								sec_status: 0
							}
						],
						character_count: 3
					},
					{
						name: 'Disasterpiece LTD',
						ticker: '--DPS',
						characters: [
							{
								name: 'CeD76',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'The Northerners',
						ticker: 'N8RTH',
						characters: [
							{
								name: 'Admiral Adama1',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Pandemic Horde Inc.',
						ticker: 'THXFC',
						characters: [
							{
								name: 'Arianna Lexandra',
								sec_status: 0
							},
							{
								name: 'DEF Mining Corp',
								sec_status: 0
							}
						],
						character_count: 2
					},
					{
						name: 'Fusion Enterprises Ltd',
						ticker: 'FUSEN',
						characters: [
							{
								name: 'Chronz',
								sec_status: 0
							},
							{
								name: 'Christina My',
								sec_status: 0
							},
							{
								name: 'Deirdre Clementi',
								sec_status: 0
							}
						],
						character_count: 3
					},
					{
						name: 'x13',
						ticker: 'X13',
						characters: [
							{
								name: 'Charoth Amperod',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Rogue Inferno.',
						ticker: 'R.INF',
						characters: [
							{
								name: 'Cmd Troi',
								sec_status: 0
							},
							{
								name: 'Angela Smith',
								sec_status: 0
							}
						],
						character_count: 2
					},
					{
						name: 'MASS',
						ticker: 'MASS',
						characters: [
							{
								name: 'Daz6900',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Desi Beanz',
						ticker: 'DESIZ',
						characters: [
							{
								name: 'Aang Dragon',
								sec_status: 0
							},
							{
								name: 'Camietoe',
								sec_status: 0
							}
						],
						character_count: 2
					},
					{
						name: 'Deaths Consortium',
						ticker: 'D3CO.',
						characters: [
							{
								name: 'August Whoo',
								sec_status: 0
							},
							{
								name: 'BoB T2',
								sec_status: 0
							},
							{
								name: 'April Whoo',
								sec_status: 0
							}
						],
						character_count: 3
					},
					{
						name: 'Albireo Solem',
						ticker: 'ASRO',
						characters: [
							{
								name: 'Cowpower Mapuci',
								sec_status: 0
							},
							{
								name: 'Caracter Aleator',
								sec_status: 0
							}
						],
						character_count: 2
					},
					{
						name: 'Horde Vanguard.',
						ticker: 'TRYHD',
						characters: [
							{
								name: 'DigBick Acimi',
								sec_status: 0
							},
							{
								name: 'Biels en Daire',
								sec_status: 0
							}
						],
						character_count: 2
					},
					{
						name: 'cookies and capital',
						ticker: 'C1AC4',
						characters: [
							{
								name: 'Acid Shi',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Brittas Empire',
						ticker: 'BREMP',
						characters: [
							{
								name: 'Ariana Alexia',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Arctic Beans',
						ticker: 'RUSFC',
						characters: [
							{
								name: 'Delovar',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Take The Bait.',
						ticker: 'FUKTD',
						characters: [
							{
								name: 'Convict Reacher',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Fancypants Inc',
						ticker: 'XDAFE',
						characters: [
							{
								name: 'Danny Rade',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Viper-Squad',
						ticker: '-VSQ-',
						characters: [
							{
								name: 'Babaganoush',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Tactical Feed.',
						ticker: 'TACF.',
						characters: [
							{
								name: 'Cal-Orrn',
								sec_status: 0
							},
							{
								name: 'Death Rex',
								sec_status: 0
							},
							{
								name: 'Cal-Dari',
								sec_status: 0
							},
							{
								name: 'Dalek Pollard',
								sec_status: 0
							}
						],
						character_count: 4
					},
					{
						name: 'Our Sanctum',
						ticker: 'OSCM.',
						characters: [
							{
								name: 'Collega',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Zero Reps Given',
						ticker: 'REPLS',
						characters: [
							{
								name: 'Andrew Dillingham Lewis',
								sec_status: 0
							},
							{
								name: 'Andy SunsetRider',
								sec_status: 0
							}
						],
						character_count: 2
					},
					{
						name: 'Profane Proverb',
						ticker: '37.2',
						characters: [
							{
								name: 'Ajanen Rin',
								sec_status: 0
							},
							{
								name: 'AsicyPureier',
								sec_status: 0
							}
						],
						character_count: 2
					},
					{
						name: 'Beyond Frontier',
						ticker: 'BE-FR',
						characters: [
							{
								name: 'Ayan Yuki',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Stay Cool And Calm Down',
						ticker: 'STCNB',
						characters: [
							{
								name: 'AATTM',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Inner Legacy',
						ticker: '-INY-',
						characters: [
							{
								name: 'Cataclysmic Dawn',
								sec_status: 0
							}
						],
						character_count: 1
					}
				],
				corporation_count: 34,
				character_count: 76
			},
			{
				name: null,
				ticker: null,
				corporations: [
					{
						name: 'School of Applied Knowledge',
						ticker: 'SAK',
						characters: [
							{
								name: 'Cash Stalker',
								sec_status: 0
							},
							{
								name: 'Bigbad BillyJean',
								sec_status: 0
							},
							{
								name: 'Cyno Moar',
								sec_status: 0
							}
						],
						character_count: 3
					},
					{
						name: 'ZOMG DOT',
						ticker: 'ZOMGD',
						characters: [
							{
								name: 'Auer Lazair',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'State War Academy',
						ticker: 'SWA',
						characters: [
							{
								name: 'Danny Salasahri',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Federal Navy Academy',
						ticker: 'FNA',
						characters: [
							{
								name: 'Atheana Echerie',
								sec_status: 0
							},
							{
								name: 'Danny Origami',
								sec_status: 0
							}
						],
						character_count: 2
					},
					{
						name: 'Center for Advanced Studies',
						ticker: 'CAS',
						characters: [
							{
								name: 'Bonya Dno',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Science and Trade Institute',
						ticker: 'STI',
						characters: [
							{
								name: 'Broseidon Kaundur',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Hyper Meme Industries',
						ticker: 'XUWUX',
						characters: [
							{
								name: 'daren55',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Rsony BKC',
						ticker: 'RBK-C',
						characters: [
							{
								name: 'Clarious Roe',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Offshore Banking Firm',
						ticker: '-OBF-',
						characters: [
							{
								name: 'Alciphei',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Royal Amarr Institute',
						ticker: 'RIN',
						characters: [
							{
								name: 'Bordan Mali Shazih',
								sec_status: 0
							}
						],
						character_count: 1
					},
					{
						name: 'Dunedain Fleet',
						ticker: 'DNFLT',
						characters: [
							{
								name: 'Declan Dovanna',
								sec_status: 0
							},
							{
								name: 'Bella Dovanna',
								sec_status: 0
							}
						],
						character_count: 2
					},
					{
						name: 'Benuse Inc.',
						ticker: 'BNUSE',
						characters: [
							{
								name: 'Antria Benuse',
								sec_status: 0
							}
						],
						character_count: 1
					}
				],
				corporation_count: 12,
				character_count: 16
			},
			{
				name: 'Pan-Intergalatic Business Community',
				ticker: 'GLD4U',
				corporations: [
					{
						name: "Dragon's Hidden Den",
						ticker: 'BAWAY',
						characters: [
							{
								name: 'Bolverk Evildoer',
								sec_status: 0
							}
						],
						character_count: 1
					}
				],
				corporation_count: 1,
				character_count: 1
			},
			{
				name: 'Northern Coalition.',
				ticker: 'NC',
				corporations: [
					{
						name: 'Destructive Influence',
						ticker: 'DICE.',
						characters: [
							{
								name: 'Arthan Orsas',
								sec_status: 0
							}
						],
						character_count: 1
					}
				],
				corporation_count: 1,
				character_count: 1
			},
			{
				name: 'Pandemic Legion',
				ticker: '-10.0',
				corporations: [
					{
						name: 'Lucidus Ordo',
						ticker: 'L-E-O',
						characters: [
							{
								name: 'cariddis',
								sec_status: 0
							}
						],
						character_count: 1
					}
				],
				corporation_count: 1,
				character_count: 1
			},
			{
				name: 'Olde Guarde Historical Preservation Society',
				ticker: 'PURGD',
				corporations: [
					{
						name: 'Alt corp 9778236423904',
						ticker: 'AC977',
						characters: [
							{
								name: 'Cyno Ambramotte',
								sec_status: 0
							}
						],
						character_count: 1
					}
				],
				corporation_count: 1,
				character_count: 1
			},
			{
				name: 'Fraternity.',
				ticker: 'FRT',
				corporations: [
					{
						name: 'Spectrum.',
						ticker: 'SPCV2',
						characters: [
							{
								name: 'Dmitryev Arsen',
								sec_status: 0
							}
						],
						character_count: 1
					}
				],
				corporation_count: 1,
				character_count: 1
			},
			{
				name: 'Out of the Blue.',
				ticker: 'VAPOR',
				corporations: [
					{
						name: 'VEN0M0US.',
						ticker: 'V1PER',
						characters: [
							{
								name: 'Baal Reginon',
								sec_status: 0
							}
						],
						character_count: 1
					}
				],
				corporation_count: 1,
				character_count: 1
			},
			{
				name: 'The Initiative.',
				ticker: 'INIT.',
				corporations: [
					{
						name: 'Aegis Victorium',
						ticker: 'AEVIC',
						characters: [
							{
								name: 'dea7hstrom',
								sec_status: 0
							},
							{
								name: 'BADdie11',
								sec_status: 0
							}
						],
						character_count: 2
					}
				],
				corporation_count: 1,
				character_count: 2
			}
		]
	};

	return {
		slugs: {
			group,
			scan
		},
		scan_data
	};
}
