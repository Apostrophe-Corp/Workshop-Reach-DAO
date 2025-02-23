import { loadStdlib, ask } from '@reach-sh/stdlib'
import * as backend from './build/index.main.mjs'
const reach = loadStdlib()

const sleep = (mSecs) => new Promise((resolve) => setTimeout(resolve, mSecs))
const noneNull = (byte) => {
	let string = '',
		i = 0
	for (i; i < byte.length; i++)
		if (String(byte[i]) !== String('\u0000')) string += byte[i]
	return string
}

let [user, contractInstance, contract, proposals, bounties] = [
	{},
	null,
	{},
	[],
	[],
]

const connectAccount = async () => {
	console.clear()

	console.log(`Reach DAO by Team 18`)
	console.log(``)
	console.info(``)
	console.log('Connect Account')

	const createAcc = await ask.ask(
		`Would you like to create an account? (Only available on DevNet) [y/n]`,
		ask.yesno
	)

	if (createAcc) {
		const account = await reach.newTestAccount(reach.parseCurrency(1000))
		user = {
			account,
			balance: async () => {
				const balAtomic = await reach.balanceOf(account)
				const balance = reach.formatCurrency(balAtomic, 4)
				return balance
			},
		}
	} else {
		const secret = await ask.ask(`What is your account secret?`, (x) => x)
		const account = await reach.newAccountFromSecret(secret)
		user = {
			account,
			balance: async () => {
				const balAtomic = await reach.balanceOf(account)
				const balance = reach.formatCurrency(balAtomic, 4)
				return balance
			},
		}
	}
	await setRole()
}

const setRole = async () => {
	console.clear()

	console.log(`Reach DAO by Team 18`)
	console.log(`Wallet Balance: ${await user.balance()}`)
	console.log(``)
	console.log('Select Role')
	contract = {}

	const isDeployer = await ask.ask('Are you the Admin? [y/n]', ask.yesno)

	if (isDeployer) {
		console.clear()

		console.log(`Reach DAO by Team 18`)
		console.log(`Wallet Balance: ${await user.balance()}`)
		console.info(``)
		console.log('Welcome Admin!')
		const shouldDeploy = await ask.ask(
			`Proceed to deployment? [y/n]`,
			ask.yesno
		)

		if (shouldDeploy) {
			await deploy()
		} else {
			await setRole()
		}
	} else {
		console.clear()

		console.log(`Reach DAO by Team 18`)
		console.log(`Wallet Balance: ${await user.balance()}`)
		console.info(``)
		console.log('Hello Attacher!')
		const info = await ask.ask(
			'Please enter the contract information',
			async (x) => {
				await attach(x)
			}
		)
	}
}

const attach = async (ctcInfoStr) => {
	console.clear()

	console.log(`Reach DAO by Team 18`)
	console.log(`Wallet Balance: ${await user.balance()}`)
	console.info(contract.ctcInfoStr ? contract.ctcInfoStr : '')
	console.log('[.] Attaching')
	try {
		const ctc = user.account.contract(backend, JSON.parse(ctcInfoStr))
		contractInstance = ctc
		contract = { ctcInfoStr }
		ctc.events.create.monitor(createProposal)
		ctc.events.that.monitor(acknowledge)
		await showInfoCenter()
	} catch (error) {
		console.log({ error })
	}
}

const connectAndUpvote = async (id, ctcInfoStr) => {
	try {
		const ctc = user.account.contract(backend, JSON.parse(ctcInfoStr))
		const upvotes = await ctc.apis.Voters.upvote()
		await contractInstance.apis.Voters.upvoted(id, parseInt(upvotes))
	} catch (error) {
		console.log({ error })
	}
}

const connectAndDownvote = async (id, ctcInfoStr) => {
	try {
		const ctc = user.account.contract(backend, JSON.parse(ctcInfoStr))
		const downvotes = await ctc.apis.Voters.downvote()
		await contractInstance.apis.Voters.downvoted(id, parseInt(downvotes))
	} catch (error) {
		console.log({ error })
	}
}

const makeContribution = async (amount, id, ctcInfoStr) => {
	try {
		const ctc = user.account.contract(backend, JSON.parse(ctcInfoStr))
		const contribs = await ctc.apis.Voters.contribute(
			reach.parseCurrency(amount)
		)
		await contractInstance.apis.Voters.contributed(id, parseInt(contribs))
	} catch (error) {
		console.log({ error })
	}
}

const connectAndClaimRefund = async (ctcInfoStr) => {
	try {
		const ctc = user.account.contract(backend, JSON.parse(ctcInfoStr))
		const didRefund = await ctc.apis.Voters.claimRefund()
		if (didRefund) {
			console.log('[+] Refund Success')
		} else {
			console.log(
				"[‼] It seems you don't have funds to claim, did you contribute to this proposal?"
			)
		}
	} catch (error) {
		console.log({ error })
	}
}

const updateProposals = async ({ what }) => {
	await contractInstance.apis.Voters.created({
		id: parseInt(what[0]),
		title: noneNull(what[1]),
		link: noneNull(what[2]),
		description: noneNull(what[3]),
		owner: noneNull(what[4]),
		contractInfo: what[5],
	})
}

const createProposal = ({ what }) => {
	proposals.push({
		id: parseInt(what[0]),
		title: noneNull(what[1]),
		link: noneNull(what[2]),
		description: noneNull(what[3]),
		owner: noneNull(what[4]),
		contract: JSON.stringify(what[5]),
		upvotes: 0,
		downvotes: 0,
		contribs: 0,
		timedOut: false,
		didPass: false,
		isDown: false,
	})
}

const acknowledge = ({ what }) => {
	const ifState = (x) => x.padEnd(20, '\u0000')
	switch (what[0]) {
		case ifState('upvoted'):
			const upProposals = proposals.map((el) => {
				if (Number(el.id) === Number(parseInt(what[1]))) {
					el['upvotes'] = parseInt(what[2])
				}
				return el
			})
			proposals = upProposals
			break
		case ifState('downvoted'):
			const downProposals = proposals.map((el) => {
				if (Number(el.id) === Number(parseInt(what[1]))) {
					el['downvotes'] = parseInt(what[2])
				}
				return el
			})
			proposals = downProposals
			break
		case ifState('contributed'):
			const conProposals = proposals.map((el) => {
				if (Number(el.id) === Number(parseInt(what[1]))) {
					el['contribs'] = reach.formatCurrency(what[2], 4)
				}
				return el
			})
			proposals = conProposals
			break
		case ifState('timedOut'):
			if (parseInt(what[2])) {
				const nBounty = proposals.filter(
					(el) => Number(el.id) === Number(parseInt(what[1]))
				)[0]
				bounties.push(nBounty)

				const xXProposals = proposals.filter(
					(el) => Number(el.id) !== Number(parseInt(what[1]))
				)
				proposals = xXProposals
			} else {
				const fProposals = proposals.map((el) => {
					if (Number(el.id) === Number(parseInt(what[1]))) {
						el['timedOut'] = true
						el['didPass'] = false
					}
					return el
				})
				proposals = fProposals
			}
			break
		case ifState('projectDown'):
			const remainingProposals = proposals.filter((el) => {
				if (Number(el.id) === Number(parseInt(what[1]))) {
					el['isDown'] = true
				}
				return Number(el.id) !== Number(parseInt(what[1]))
			})
			proposals = remainingProposals
			break
		default:
			break
	}
}

const timeoutProposal = async ({ what }) => {
	const ifState = (x) => x.padEnd(20, '\u0000')
	switch (what[0]) {
		case ifState('passed'):
			try {
				await contractInstance.apis.Voters.timedOut(parseInt(what[1]), 1)
			} catch (error) {
				console.log('[‼] A transaction clashed with a timeout')
			}
			break
		case ifState('failed'):
			try {
				await contractInstance.apis.Voters.timedOut(parseInt(what[1]), 0)
			} catch (error) {
				console.log('[‼] A transaction clashed with a timeout')
			}
			break
		case ifState('down'):
			try {
				await contractInstance.apis.Voters.projectDown(parseInt(what[1]))
			} catch (error) {
				console.log('[‼] A transaction clashed with a teardown')
			}
			break
		default:
			break
	}
}

const deploy = async () => {
	console.clear()

	console.log(`Reach DAO by Team 18`)
	console.log(`Wallet Balance: ${await user.balance()}`)
	console.info(``)
	console.log('[.] Deploying')
	const ctc = user.account.contract(backend)
	contractInstance = ctc
	const interact = {
		getProposal: {
			id: 1,
			title: 'Reach DAO',
			link: 'https://github.com/Apostrophe-Corp/Reach-DAO/blob/main/README.md',
			description: `A hub for Web3 Developers`,
			owner: user.account.networkAccount.addr,
			deadline: 0,
			isProposal: false,
		},
	}

	ctc.p.Deployer(interact)
	const ctcInfoStr = JSON.stringify(await ctc.getInfo(), null)
	ctc.events.create.monitor(createProposal)
	ctc.events.that.monitor(acknowledge)
	contract = { ctcInfoStr }
	console.clear()

	console.log(`Reach DAO by Team 18`)
	console.log(`Wallet Balance: ${await user.balance()}`)
	console.info(``)
	console.log(`[+] Deployed`)
	console.group(`Here is the contract information`)
	console.log(`${contract.ctcInfoStr}`)
	console.groupEnd(`Here is the contract information`)
	await sleep(5000)
	await showInfoCenter()
}

const makeProposal = async (proposal) => {
	const proposalSetup = async () => {
		const deadline = { ETH: 2, ALGO: 20, CFX: 2000 }[reach.connector]
		const ctc = user.account.contract(backend)
		ctc.p.Deployer({
			getProposal: {
				...proposal,
				deadline: deadline,
				isProposal: true,
			},
		})
		ctc.events.log.monitor(timeoutProposal)
		ctc.events.created.monitor(updateProposals)
	}
	await proposalSetup()
}

const showInfoCenter = async () => {
	console.clear()

	console.log(`Reach DAO by Team 18`)
	console.log(`Wallet Balance: ${await user.balance()}`)
	console.info(contract.ctcInfoStr ? contract.ctcInfoStr : '')
	console.group(`Info Center`)
	console.log(`Welcome! To the new Hub!`)
	console.groupEnd(`Info Center`)

	const respondTo = async (request) => {
		switch (request) {
			case 1:
				await showProposals()
				break
			case 2:
				await showBounties()
				break
			case 3:
				await setRole()
				break
			case 0:
				const confirmed = await ask.ask(`[‼] Confirm exit [y/n]`, ask.yesno)
				if (confirmed) process.exit(0)
				else await showInfoCenter()
				break
			default:
				await showInfoCenter()
				break
		}
	}

	const userInput = await ask.ask(
		`[+] Console Menu
  1. View Proposals
  2. View Bounties
  3. Back to Select Roles
  0. Exit Reach DAO`,
		(input) => {
			if (isNaN(input)) {
				throw Error('[‼] Please enter a numeric value')
			} else {
				return Number(input)
			}
		}
	)

	await respondTo(userInput)
}

const showProposals = async () => {
	console.clear()

	console.log(`Reach DAO by Team 18`)
	console.log(`Wallet Balance: ${await user.balance()}`)
	console.info(contract.ctcInfoStr ? contract.ctcInfoStr : '')
	console.group(`Proposals`)
	console.log(`Get the chance to bring your ideas to life!`)
	console.groupEnd(`Proposals`)

	const getProposalInfo = async () => {
		let [title, link, description] = ['', '', '']

		title = await ask.ask(`[+] Enter the Proposal's Title Max (25)`, (value) =>
			String(value).slice(0, 25)
		)

		link = await ask.ask(
			`[+] Enter the Link to the Proposal's details (Max 150)`,
			(value) => String(value).slice(0, 150)
		)

		description = await ask.ask(
			`[+] Enter a brief description of the Proposal (Max 180)`,
			(value) => String(value).slice(0, 180)
		)

		const satisfied = await ask.ask(
			`Are you satisfied with these details? [y/n]
  Title: ${title}
  Link: ${link}
  Description: ${description}`,
			ask.yesno
		)

		if (satisfied) {
			let proposal = {
				id:
					proposals.length > 0
						? proposals.length === 1
							? proposals[0].id + 1
							: Number(
									proposals.reduce((a, b) => (a.id > b.id ? a.id : b.id))
							  ) + 1
						: 1,
				title,
				link,
				description,
				owner: user.account.networkAccount.addr,
			}
			console.log('[.] Creating proposal')
			await makeProposal(proposal).then(async () => {
				await showProposals()
			})
		} else {
			await getProposalInfo()
		}
	}

	const selectActiveProposal = async (page = 1) => {
		let [section, activeProposals, proposalsOnDisplay] = [
			page,
			proposals.filter((el) => !el.timedOut),
			[],
		]

		proposalsOnDisplay = activeProposals.filter(
			(el, i) => i + 1 > (section - 1) * 3 && i + 1 <= section * 3
		)
		const lenOfProposals = proposalsOnDisplay.length
		console.group('Active Proposals')
		if (lenOfProposals) {
			proposalsOnDisplay.forEach((p, i) => {
				console.log(`ID: ${i + 1},
Title: ${p.title ?? 'Title'}
Description: ${p.description ?? 'Description'}
Owner: ${p.owner ?? user.account.networkAccount.addr}
Link: ${p.link ?? 'Link'}
Contributions: ${p.contribs ?? 0} ${reach.standardUnit}
Up_Votes: ${p.upvotes}
Down_Votes: ${p.downvotes}\n
`)
			})
		} else {
			console.log('[+] None at the moment.')
		}
		console.groupEnd('Active Proposals')

		await ask.ask(
			lenOfProposals
				? `[+] Enter the Proposal's ID of interest
  ${
		section < Math.ceil(activeProposals.length / 3)
			? 'Enter 99 to view the next list'
			: ''
	}
  ${section > 1 ? 'Enter 88 to view the previous list' : ''}
  Or enter 0 to exit`
				: '[+] Enter any key to exit',
			lenOfProposals
				? async (input) => {
						if (isNaN(input)) {
							throw Error('[‼] Please enter a numeric value')
						} else if (input == 0) {
							await showProposals()
						} else if (
							Number(input) <= proposalsOnDisplay.length &&
							Number(input) >= 1
						) {
							const selectedProposal = proposalsOnDisplay[input - 1]
							const action = await ask.ask(
								`What would you like to do?
  1. Contribute
  2. Up vote
  3. Down vote
  0. Cancel`,
								(x) => {
									if (isNaN(x)) {
										throw Error('[‼] Please enter a numeric value')
									} else {
										return Number(x)
									}
								}
							)

							switch (action) {
								case 1:
									const amount = await ask.ask(
										`Please enter the amount in ${reach.standardUnit}`,
										(x) => {
											try {
												x = Number(x)
											} catch (error) {
												throw Error('[‼] Please enter a numeric value')
											}
											return x
										}
									)
									console.log('[.] Processing contribution')
									await makeContribution(
										amount,
										selectedProposal.id,
										selectedProposal.contract
									).then(async () => {
										await showProposals()
									})
									break
								case 2:
									console.log('[.] Processing up vote')
									await connectAndUpvote(
										selectedProposal.id,
										selectedProposal.contract
									).then(async () => {
										await showProposals()
									})
									break
								case 3:
									console.log('[.] Processing down vote')
									await connectAndDownvote(
										selectedProposal.id,
										selectedProposal.contract
									).then(async () => {
										await showProposals()
									})
									break
								case 0:
									await selectActiveProposal(section)
									break
								default:
									await selectActiveProposal(section)
									break
							}
						} else if (input == 88 && section > 1) {
							await selectActiveProposal(section - 1)
						} else if (
							input == 99 &&
							section < Math.ceil(activeProposals.length / 3)
						) {
							await selectActiveProposal(section + 1)
						} else {
							console.log('[‼] Invalid response')
							await sleep(2000)
							await selectActiveProposal(section)
						}
						return
				  }
				: async () => {
						await showProposals()
				  }
		)
	}

	const selectTimedOutProposal = async (page = 1) => {
		let [section, timeoutProposals, proposalsOnDisplay] = [
			page,
			proposals.filter((el) => el.timedOut),
			[],
		]

		proposalsOnDisplay = timeoutProposals.filter(
			(el, i) => i + 1 > (section - 1) * 3 && i + 1 <= section * 3
		)
		const lenOfProposals = proposalsOnDisplay.length
		console.group('Timed Out Proposals')
		if (lenOfProposals) {
			proposalsOnDisplay.forEach((p, i) => {
				console.log(`ID: ${i + 1}
Title: ${p.title ?? 'Title'}
Description: ${p.description ?? 'Description'}
Owner: ${p.owner ?? user.account.networkAccount.addr}
Link: ${p.link ?? 'Link'}\n
`)
			})
		} else {
			console.log('[+] None at the moment.')
		}
		console.groupEnd('Timed Out Proposals')

		await ask.ask(
			lenOfProposals
				? `[+] Enter the Proposal's ID to claim a refund
  ${
		section < Math.ceil(timeoutProposals.length / 3)
			? 'Enter 99 to view the next list'
			: ''
	}
  ${section > 1 ? 'Enter 88 to view the previous list' : ''}
  Or enter 0 to exit`
				: '[+] Enter any key to exit',
			lenOfProposals
				? async (input) => {
						if (isNaN(input)) {
							throw Error('[‼] Please enter a numeric value')
						} else if (input == 0) {
							await showProposals()
						} else if (
							Number(input) <= proposalsOnDisplay.length &&
							Number(input) >= 1
						) {
							const selectedProposal = proposalsOnDisplay[input - 1]
							await connectAndClaimRefund(selectedProposal.contract)
							await showProposals()
						} else if (input == 88 && section > 1) {
							await selectActiveProposal(section - 1)
						} else if (
							input == 99 &&
							section < Math.ceil(timeoutProposals.length / 3)
						) {
							await selectActiveProposal(section + 1)
						} else {
							console.log('[‼] Invalid response')
							await sleep(2000)
							await selectActiveProposal(section)
						}
						return
				  }
				: async () => {
						await showProposals()
				  }
		)
	}

	const respondTo = async (request) => {
		switch (request) {
			case 1:
				await getProposalInfo()
				break
			case 2:
				await selectActiveProposal()
				break
			case 3:
				await selectTimedOutProposal()
				break
			case 4:
				await showBounties()
				break
			case 5:
				await showInfoCenter()
				break
			case 6:
				await setRole()
				break
			case 0:
				const confirmed = await ask.ask(`[‼] Confirm exit [y/n]`, ask.yesno)
				if (confirmed) process.exit(0)
				else await showProposals()
				break
			default:
				await showProposals()
				break
		}
	}

	const userInput = await ask.ask(
		`[+] Console Menu
  1. Make a Proposal
  2. Select an Active Proposal
  3. Select a Timed Out Proposal
  4. View Bounties
  5. View Info Center
  6. Back to Select Roles
  0. Exit Reach DAO`,
		(input) => {
			if (isNaN(input)) {
				throw Error('[‼] Please enter a numeric value')
			} else {
				return Number(input)
			}
		}
	)

	await respondTo(userInput)
}

const showBounties = async () => {
	console.clear()

	console.log(`Reach DAO by Team 18`)
	console.log(`Wallet Balance: ${await user.balance()}`)
	console.info(contract.ctcInfoStr ? contract.ctcInfoStr : '')
	console.group(`Bounties`)
	console.log(`Lets Hack and claim the Bounty...`)
	console.groupEnd(`Bounties`)

	const selectActiveBounty = async (page = 1) => {
		let [i, section, activeBounties, bountiesOnDisplay] = [
			0,
			page,
			bounties,
			[],
		]

		bountiesOnDisplay = activeBounties.filter(
			(el, i) => i + 1 > (section - 1) * 3 && i + 1 <= section * 3
		)
		const lenOfBounties = bountiesOnDisplay.length
		console.group('Active Bounties')
		if (lenOfBounties) {
			bountiesOnDisplay.forEach((b, i) => {
				console.log(`ID: ${i + 1}
Title: ${b.title ?? 'Title'}
Description: ${b.description ?? 'Description'}
Owner: ${b.owner ?? user.account.networkAccount.addr}
Link: ${b.link ?? 'Link'}
Grand_Prize: 99999 ${reach.standardUnit}\n
`)
			})
		} else {
			console.log('[+] None at the moment.')
		}
		console.groupEnd('Active Bounties')

		await ask.ask(
			lenOfBounties
				? `[+] Enter the Bounty's ID of interest
  ${
		section < Math.ceil(activeBounties.length / 3)
			? 'Enter 99 to view the next list'
			: ''
	}
  ${section > 1 ? 'Enter 88 to view the previous list' : ''}
  Or enter 0 to exit`
				: '[+] Enter any key to exit',
			lenOfBounties
				? async (input) => {
						if (isNaN(input)) {
							throw Error('[‼] Please enter a numeric value')
						} else if (input == 0) {
						} else if (
							Number(input) <= bountiesOnDisplay.length &&
							Number(input) >= 1
						) {
							console.log(`[+] Thanks for showing your interest in this quest.
  Stick around a while and our Guild would be fully operational.
  Until then, get your weapons, armor and, party members ready!!!`)
							await sleep(5000)
							await showBounties()
						} else if (input == 88 && section > 1) {
							await selectActiveBounty(section - 1)
						} else if (
							input == 99 &&
							section < Math.ceil(activeBounties.length / 3)
						) {
							await selectActiveBounty(section + 1)
						} else {
							console.log('[‼] Invalid response')
							await sleep(2000)
							await selectActiveBounty(section)
						}
						return
				  }
				: async () => {
						await showBounties()
				  }
		)
	}

	const respondTo = async (request) => {
		switch (request) {
			case 1:
				await selectActiveBounty()
				break
			case 2:
				await showInfoCenter()
				break
			case 3:
				await showProposals()
				break
			case 4:
				await setRole()
				break
			case 0:
				const confirmed = await ask.ask(`[‼] Confirm exit [y/n]`, ask.yesno)
				if (confirmed) process.exit(0)
				else await showBounties()
				break
			default:
				await showBounties()
				break
		}
	}

	const userInput = await ask.ask(
		`[+] Console Menu
  1. Select an Active Bounty
  2. View Info Center
  3. View Proposals
  4. Back to Select Roles
  0. Exit Reach DAO`,
		(input) => {
			if (isNaN(input)) {
				throw Error('[‼] Please enter a numeric value')
			} else {
				return Number(input)
			}
		}
	)

	await respondTo(userInput)
}

await connectAccount()
ask.done()
process.exit(0)
