// Native
import os from 'os'

// Packages
import electron from 'electron'
import React from 'react'
import { func, object } from 'prop-types'

// Components
import Avatar from './avatar'

class Switcher extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      teams: [],
      scope: null,
      online: true,
      createTeam: false
    }

    this.remote = electron.remote || false
    this.ipcRenderer = electron.ipcRenderer || false
  }

  componentWillReceiveProps({ currentUser }) {
    if (!currentUser) {
      return
    }

    if (this.state.scope !== null) {
      return
    }

    this.setState({
      scope: currentUser.uid
    })
  }

  componentWillMount() {
    // Support SSR
    if (typeof window === 'undefined') {
      return
    }

    const states = ['online', 'offline']

    for (const state of states) {
      window.addEventListener(state, this.setOnlineState.bind(this))
    }

    if (!this.remote) {
      return
    }

    const currentWindow = this.remote.getCurrentWindow()

    if (!currentWindow) {
      return
    }

    currentWindow.on('show', () => {
      document.addEventListener('keydown', this.keyDown.bind(this))
    })

    currentWindow.on('hide', () => {
      document.removeEventListener('keydown', this.keyDown.bind(this))
    })
  }

  setOnlineState() {
    this.setState({
      online: navigator.onLine
    })
  }

  async componentDidMount() {
    const listTimer = time => {
      setTimeout(async () => {
        if (!this.state.online) {
          listTimer(1000)
          return
        }

        try {
          await this.loadTeams()
        } catch (err) {
          listTimer(1000)
          return
        }

        listTimer()
      }, time || 4000)
    }

    // Only start updating teams once they're loaded!
    // This needs to be async so that we can already
    // start the state timer below for the data that's already cached
    if (!this.state.online) {
      listTimer(1000)
      return
    }

    this.loadTeams().then(listTimer).catch(listTimer)

    // Check the config for `currentTeam`
    await this.checkCurrentTeam()

    // Update the scope if the config changes
    this.listenToConfig()
  }

  listenToConfig() {
    if (!this.ipcRenderer) {
      return
    }

    this.ipcRenderer.on('config-changed', () => {
      if (this.state.teams.length === 0) {
        return
      }

      this.checkCurrentTeam()
    })
  }

  resetScope() {
    const currentUser = this.props.currentUser

    if (!currentUser) {
      return
    }

    this.changeScope({
      id: currentUser.uid
    })
  }

  async checkCurrentTeam() {
    if (!this.remote) {
      return
    }

    const { getConfig } = this.remote.require('./utils/config')
    const config = await getConfig()

    if (!config) {
      return
    }

    if (!config.currentTeam) {
      this.resetScope()
      return
    }

    this.changeScope(config.currentTeam, true)
  }

  async loadTeams() {
    if (!this.remote) {
      return
    }

    const loadData = this.remote.require('./utils/data/load')
    const { API_TEAMS } = this.remote.require('./utils/data/endpoints')
    const data = await loadData(API_TEAMS)

    if (!data || !data.teams || !this.props.currentUser) {
      return
    }

    const teams = data.teams
    const user = this.props.currentUser

    teams.unshift({
      id: user.uid,
      name: user.username
    })

    // Only update state if the list of teams has changed
    if (this.state.teams !== teams) {
      this.setState({ teams })

      if (!this.props.setTeams) {
        return
      }

      // Save teams
      await this.props.setTeams(teams)
    }
  }

  keyDown(event) {
    const activeItem = document.activeElement

    if (activeItem && activeItem.tagName === 'INPUT') {
      return
    }

    const code = event.code
    const number = code.includes('Digit') ? code.split('Digit')[1] : false

    if (number && number <= 9 && this.state.teams.length > 1) {
      if (this.state.teams[number - 1]) {
        event.preventDefault()

        const relatedTeam = this.state.teams[number - 1]
        this.changeScope(relatedTeam)
      }
    }
  }

  async updateConfig(team) {
    if (!this.remote) {
      return
    }

    const { saveConfig } = this.remote.require('./utils/config')
    const currentUser = this.props.currentUser

    if (!currentUser) {
      return
    }

    const info = {
      currentTeam: {}
    }

    // Only add fresh data to config if new scope is team, not user
    // Otherwise just clear it
    if (currentUser.uid !== team.id) {
      // Only save the data we need, not the entire object
      info.currentTeam = {
        id: team.id,
        slug: team.slug,
        name: team.name
      }
    }

    await saveConfig(info)
  }

  changeScope(team, saveToConfig) {
    // If the clicked item in the team switcher is
    // already the active one, don't do anything
    if (this.state.scope === team.id) {
      return
    }

    if (!this.props.setFeedScope) {
      return
    }

    // Load different messages into the feed
    this.props.setFeedScope(team.id)

    // Make the team/user icon look active by
    // syncing the scope with the feed
    this.setState({ scope: team.id })

    // Save the new `currentTeam` to the config
    if (saveToConfig) {
      this.updateConfig(team)
    }
  }

  openMenu() {
    // The menu toggler element has children
    // we have the ability to prevent the event from
    // bubbling up from those, but we need to
    // use `this.menu` to make sure the menu always gets
    // bounds to the parent
    const { bottom, left, height, width } = this.menu.getBoundingClientRect()
    const sender = electron.ipcRenderer || false

    if (!sender) {
      return
    }

    sender.send('open-menu', {
      x: left,
      y: bottom,
      height,
      width
    })
  }

  renderTeams() {
    if (!this.state) {
      return
    }

    const teams = this.state.teams

    return teams.map((team, index) => {
      const isActive = this.state.scope === team.id ? 'active' : ''

      const clicked = () => {
        this.changeScope(team, true)
      }

      return (
        <li onClick={clicked} className={isActive} key={team.id}>
          <Avatar team={team} isUser={index === 0} scale delay={index} />

          <style jsx>
            {`
            /*
              Do not user hidden overflow here, otherwise
              the images will be cut off at the bottom
              that's a renderer-bug in chromium
            */

            li {
              width: 23px;
              height: 23px;
              border-radius: 100%;
              margin-right: 10px;
              opacity: .3;
              transition: opacity .3s ease;
            }

            li.active {
              opacity: 1;
              cursor: default;
            }
          `}
          </style>
        </li>
      )
    })
  }

  createTeam() {
    electron.shell.openExternal('https://zeit.co/teams/create')
  }

  scrollToEnd(event) {
    event.preventDefault()

    if (!this.list) {
      return
    }

    const list = this.list
    list.scrollLeft = list.scrollWidth
  }

  prepareCreateTeam(when) {
    if (when === 0) {
      return
    }

    const delay = 100 + 100 * when

    setTimeout(() => {
      this.setState({
        createTeam: true
      })
    }, delay)
  }

  render() {
    const menuRef = element => {
      this.menu = element
    }

    const listRef = element => {
      this.list = element
    }

    const teams = this.renderTeams()
    const classes = []

    if (this.state.createTeam) {
      classes.push('shown')
    } else {
      this.prepareCreateTeam(teams.length)
    }

    if (os.platform() === 'win32') {
      classes.push('windows')
    }

    return (
      <aside>
        {this.state.online
          ? <ul ref={listRef}>
              {teams}

              <li
                onClick={this.createTeam}
                title="Create a Team"
                className={classes.join(' ')}
              >
                <i />
                <i />
              </li>

              <span className="shadow" onClick={this.scrollToEnd.bind(this)} />
            </ul>
          : <p className="offline">{`You're offline!`}</p>}

        <a
          className="toggle-menu"
          onClick={this.openMenu.bind(this)}
          ref={menuRef}
        >
          <i />
          <i />
          <i />
        </a>

        <style jsx>
          {`
          ul {
            margin: 0;
            list-style: none;
            display: flex;
            flex-direction: row;
            flex-shrink: 1;
            flex-grow: 1;
            padding: 0 0 0 10px;
            height: inherit;
            align-items: center;
            overflow-x: auto;
            overflow-y: hidden;
            position: relative;
          }

          ul:after {
            content: '';
            width: 23px;
            display: block;
            height: inherit;
            flex-shrink: 0;
          }

          ul::-webkit-scrollbar {
            display: none;
          }

          ul .shadow {
            display: block;
            height: 40px;
            width: 40px;
            background: linear-gradient(to right, transparent, #fff);
            position: fixed;
            left: calc(290px - 40px);
            bottom: 0;
          }

          .windows + .shadow {
            bottom: 12px;
          }

          li {
            height: 23px;
            width: 23px;
            border-radius: 100%;
            box-sizing: border-box;
            border: 1px solid #b1b1b1;
            position: relative;
            transition: border .2s, transform 0.6s;
            flex-shrink: 0;
            transform: scale(0);
          }

          li.shown {
            transform: scale(1);
          }

          li:hover {
            border-color: #4e4e4e;
          }

          li i {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            justify-content: center;
            align-items: center;
          }

          li i:before {
            content: '';
            display: block;
            background: #b1b1b1;
            height: 11px;
            width: 1px;
            transition: all .2s ease;
          }

          li:hover i:before {
            height: 15px;
            background: #4e4e4e;
          }

          li i:last-child {
            transform: rotate(90deg);
          }

          aside {
            height: 40px;
            bottom: 0;
            left: 0;
            right: 0;
            flex-shrink: 0;
            flex-grow: 0;
            border-top: 1px solid #D6D6D6;
            display: flex;
            background: #fff;
            user-select: none;
            justify-content: space-between;
          }

          aside .toggle-menu {
            display: block;
            width: 40px;
            height: 40px;
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
            flex-shrink: 0;
          }

          aside .toggle-menu i {
            width: 18px;
            height: 1px;
            background: #4e4e4e;
            display: block;
            opacity: .5;
            transition: opacity .2s ease;
          }

          aside .toggle-menu i:nth-child(2) {
            margin: 3px 0;
          }

          aside .toggle-menu:hover i {
            opacity: 1;
          }

          .offline {
            margin: 0;
            line-height: 40px;
            padding-left: 10px;
            font-size: 12px;
            color: #4e4e4e;
          }
        `}
        </style>
      </aside>
    )
  }
}

Switcher.propTypes = {
  setFeedScope: func,
  currentUser: object,
  setTeams: func
}

export default Switcher
