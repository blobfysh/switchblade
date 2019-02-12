const fetch = require('node-fetch')
const Joi = require('joi')
const jwt = require('jsonwebtoken')

const API_URL = 'https://discordapp.com/api'

module.exports = class EndpointUtils {
  static authenticate ({ client }, adminOnly = false, fetchGuilds = false) {
    return async (req, res, next) => {
      const authorization = req.get('Authorization')
      if (authorization) {
        const [ identifier, token ] = authorization.split(' ')
        if (!identifier || !token) return res.status(400).json({ ok: false })

        switch (identifier) {
          case 'User':
            if (!adminOnly) {
              try {
                const { accessToken } = jwt.verify(token, process.env.JWT_SECRET)
                req.user = await this._fetchUser(client, accessToken)
                if (fetchGuilds) req.guilds = await this._fetchGuilds(client, accessToken)
                return next()
              } catch (e) {
                return res.status(401).json({ ok: false })
              }
            }
            break
          case 'Admin':
            if (token === process.env.ADMIN_TOKEN) {
              req.isAdmin = true
              return next()
            }
        }
        return res.status(401).json({ ok: false })
      }
      return res.status(400).json({ ok: false })
    }
  }

  static _fetchUser (client, token) {
    return this._requestDiscord('/users/@me', token)
  }

  static async _fetchGuilds (client, token) {
    return this._requestDiscord('/users/@me/guilds', token).then(gs => gs.map(g => {
      g.common = client.guilds.has(g.id)
      return g
    }))
  }

  static _requestDiscord (endpoint, token) {
    if (!token) throw new Error('INVALID_TOKEN')

    return fetch(`${API_URL}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(res => res.ok ? res.json() : Promise.reject(res))
  }

  static handleUser ({ client }) {
    return (req, res, next) => {
      let id = req.params.userId
      if (id) {
        switch (id) {
          case '@me':
            id = req.isAdmin ? client.user.id : req.user.id
            break
          default:
            if (!req.isAdmin && id !== req.user.id) {
              return res.status(403).json({ ok: false })
            }
        }
        req.userId = id
        return next()
      }
      return res.status(401).json({ ok: false })
    }
  }

  static handleDBLPayload () {
    return async (req, res, next) => {
      const authorization = req.get('Authorization')
      if (authorization && authorization === process.env.DBL_WEBHOOK_SECRET) {
        const payload = req.body
        if (payload !== {}) {
          const PayloadSchema = Joi.object().keys({
            bot: Joi.string().min(18).max(18).required(),
            user: Joi.string().min(17).max(18).required(),
            type: Joi.string().equal('upvote').required()
          })
          Joi.validate(payload, PayloadSchema).then(output => {
            next()
          }).catch(error => res.status(500).json(error))
        } else return res.status(400).json({ error: 'No body' })
      } else return res.status(401).json({ error: 'Invalid Authorization header' })
    }
  }
}