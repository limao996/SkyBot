"use strict"
const myid = 主人qq号
const qid = 机器人QQ号
const gid = [审核群]
const gids = gid
const Sky = require("./sky")
const axios = require("axios")
const oicq = require("oicq")
const iconv = require("iconv-lite")
const bot = oicq.createClient(qid)
const NeDB = require("nedb")
const fs = require("fs")
const DB = new NeDB({
    autoload: true,
    filename: __dirname + '/data.db'
})
const SkyDB = new NeDB({
    autoload: true,
    filename: __dirname + '/sky.db'
})

bot.on("system.login.qrcode", () => {
    console.log("扫码后按Enter完成登录")
    process.stdin.once("data", () => {
        console.log('登陆成功！')
        bot.login()
    })
}).login()

bot.on('request.friend', (e) => {
    e.approve(true)
})

bot.on('request.group.invite', (e) => {
    DB.findOne({ qqid: e.user_id, type: 'user_list' }, (err, docs) => {
        if (docs)
            e.approve(true)
        else
            e.approve(false)
    })
})

setInterval(async () => bot.sendPrivateMsg(myid, `心跳: ${new Date().toLocaleString()}\n在线状态: ${bot.isOnline()}`), 60000 * 60)

const user_data = {}
const request_list = {}
bot.on("message.group", (e) => {
    let sender = e.sender
    let msg = e.raw_message
    let msgs = msg.match(/[^\s]+/g)
    let f = false
    for (let v of gid)
        f |= e.group_id == v
    if (f) {
        switch (msg) {
            case "#申请权限":
            case "#权限申请": {
                DB.findOne({ qqid: sender.user_id, type: 'user_list' }, (err, docs) => {
                    if (docs)
                        e.reply("您已有权限，无需申请！", true)
                    else if (request_list[sender.user_id] != null)
                        e.reply("您已提交过申请！", true)
                    else {
                        request_list[sender.user_id] = e
                        bot.sendPrivateMsg(myid, sender.nickname + "(" + sender.user_id + ") 向您发起了权限申请！")
                        e.reply("提交成功！", true)
                    }
                })
            }
        }

    }

    if (msgs[0] == '#绑定群聊') {
        if (f && sender.user_id != myid)
            return
        DB.findOne({ qqid: sender.user_id, type: 'user_list' }, (err, docs) => {
            if (docs)
                DB.findOne({ gid: e.group_id, qqid: sender.user_id, type: 'group_list' }, (err, d) => {
                    if (!d) {
                        let c
                        if (msgs[1])
                            c = msgs.slice(1)
                        DB.insert({ gid: e.group_id, qqid: sender.user_id, channel: c, type: 'group_list' }, (err, d) => {
                            e.reply("绑定成功！", true)
                        })
                    }
                })
        })
    } else if (msg == '#查看分组') {
        if (f && sender.user_id != myid)
            return
        DB.findOne({ qqid: sender.user_id, type: 'user_list' }, (err, docs) => {
            if (docs)
                DB.findOne({ gid: e.group_id, qqid: sender.user_id, type: 'group_list' }, (err, d) => {
                    if (d) {
                        let str = '无'
                        if (d.channel)
                            str = `分组: ${d.channel.join(', ')}`
                        e.reply(str, true)
                    }
                })
        })
    } else if (msg == '#解绑群聊') {
        DB.findOne({ qqid: sender.user_id, type: 'user_list' }, (err, docs) => {
            if (docs)
                DB.findOne({ gid: e.group_id, qqid: sender.user_id, type: 'group_list' }, (err, d) => {
                    if (d) {
                        DB.remove({ gid: e.group_id, qqid: sender.user_id, type: 'group_list' }, {}, (err, d) => {
                            e.reply("解绑成功！", true)
                        })
                    }
                })
        })
    }


    if (msgs[0] == '#检索') {
        DB.find({ gid: e.group_id, type: 'group_list' }, async (err, d0) => {
            if (d0.length == 0)
                return

            let s = msgs[1]

            let re = eval("/" + s + "/")
            let q = []
            for (let v of d0) {
                let gml = await bot.getGroupMemberList(e.group_id)
                if (!gml.get(v.qqid)) {
                    DB.remove({ gid: e.group_id, qqid: v.qqid, type: 'group_list' }, {})
                    continue
                }
                if (v.channel) {
                    q.push({ qqid: v.qqid, channel: { $in: v.channel }, type: "data", id: s })
                    q.push({ qqid: v.qqid, channel: { $in: v.channel }, type: "data", title: re })
                    q.push({ qqid: v.qqid, channel: { $exists: false }, type: "data", id: s })
                    q.push({ qqid: v.qqid, channel: { $exists: false }, type: "data", title: re })
                } else {
                    q.push({ qqid: v.qqid, type: "data", id: s })
                    q.push({ qqid: v.qqid, type: "data", title: re })
                }
            }

            await e.reply("正在检索...")
            DB.find({ $or: q }, async (err, d) => {
                if (d.length == 0) {
                    e.reply("结果为空！")
                    return
                }

                d.sort((a, b) => {
                    a = a.id, b = b.id
                    if (a > b)
                        return -1
                    else if (a < b)
                        return 1
                    return 0
                })

                let docs = page(d, 800)
                for (let doc of docs) {
                    if (doc.length == 1 && docs.length == 1) {
                        let v = doc[0]
                        let str = ''
                        if (v.channel)
                            str = `\n分组: ${v.channel.join(', ')}`

                        let t = [
                            {
                                user_id: bot.uin,
                                nickname: bot.nickname,
                                time: Date.now(),
                                message: [{ type: 'text', text: `id: ${v.id}\n标题: ${v.title}${str}` }],
                            }
                        ]
                        for (let v0 of v.msg) {
                            if (v0[0].type == 'file') {
                                try {
                                    let url = await bot.pickFriend(v.qqid).getFileUrl(v0[0].fid);
                                    if (url.indexOf('fname=') == -1) {
                                        url += '&fname=' + v0[0].name;
                                    }
                                    v0[0] = `文件名称: ${v0[0].name}\n文件大小: ${(v0[0].size / 1024 / 1024).toFixed(2)}MB\n下载链接: ${encodeURI(url)}`
                                } catch (e) {
                                    console.log(e)
                                    continue
                                }
                            }
                            t.push({
                                user_id: v.qqid,
                                nickname: v.name,
                                time: Date.now(),
                                message: v0
                            })
                        }
                        await e.reply(await bot.makeForwardMsg(t, false))
                        return
                    }

                    let list = [
                        {
                            user_id: bot.uin,
                            nickname: bot.nickname,
                            time: Date.now(),
                            message: [
                                { type: 'text', text: `检索完成，找到${doc.length}条记录！` },
                            ]
                        }
                    ]


                    for (let v of page(doc, 10)) {
                        let s = []
                        for (let v1 of v) {
                            let str = ''
                            if (v1.channel)
                                str = `\n分组: ${v1.channel.join(', ')}`

                            s.push(`id: ${v1.id}\n标题: ${v1.title}${str}`)
                        }
                        list.push({
                            user_id: bot.uin,
                            nickname: bot.nickname,
                            time: Date.now(),
                            message: [{ type: 'text', text: s.join('\n\n') }],
                        })
                    }

                    e.reply(await bot.makeForwardMsg(list, false))
                }
            })
        })
    }


})

let config = {
    Color_Overlay: true,
    Image_Overlay: false,
    Stroke_Overlay: true,
    Background_Color: '#141E17',
    Stroke_Color: '#ffffff',
    Text_Color: '#ffffff',
    Line_Color: '#ffffff',
    Number_Color: '#ffffff',
    Sign_Color: '#10ffffff'
}

let key1 = {
    颜色叠加: 'Color_Overlay',
    图片叠加: 'Image_Overlay',
    边框叠加: 'Stroke_Overlay',
    背景颜色: 'Background_Color',
    边框颜色: 'Stroke_Color',
    字体颜色: 'Text_Color',
    小节颜色: 'Line_Color',
    行号颜色: 'Number_Color',
    标记颜色: 'Sign_Color'
}

let key2 = {
    Color_Overlay: '颜色叠加',
    Image_Overlay: '图片叠加',
    Stroke_Overlay: '边框叠加',
    Background_Color: '背景颜色',
    Stroke_Color: '边框颜色',
    Text_Color: '字体颜色',
    Line_Color: '小节颜色',
    Number_Color: '行号颜色',
    Sign_Color: '标记颜色'
}

let states = {}
let temp_config = {}

bot.on("message.private", async (e) => {
    let sender = e.sender
    let m = e.message
    let msg = e.raw_message
    let qid = sender.user_id
    let msgs = msg.match(/[^\s]+/g)
    if (states[qid] == null)
        states[qid] = 0
    let state = states[qid]
    let temp = temp_config[qid]

    switch (state) {
        case 4:
            e.reply('正在生成...')
            let fid0 = m[0].fid
            if ((!fid0) || !/.txt/.test(m[0].name)) {
                states[qid] = 0
                e.reply('只允许上传txt文件！')
                break
            }

            let url0 = await bot.pickFriend(qid).getFileUrl(fid0);
            if (url0.indexOf('fname=') == -1) {
                url0 += '&fname=' + m[0].name;
            }
            url0 = encodeURI(url0)
            let res = await axios({
                url: url0,
                responseType: 'arraybuffer',
                method: 'get'
            })
            let data = res.data
            if (data[0] == 0xff && data[1] == 0xfe)
                data = iconv.decode(data, 'utf16-le')
            try {
                data = JSON.parse(data.toString())
            } catch (err) {
                states[qid] = 0
                e.reply('文件格式错误，只允许使用json格式的txt文件！')
                break
            }

            let t = {}
            SkyDB.findOne({ qid: qid, type: 'sky_config' }, (err, doc) => {
                if (doc) {
                    t = JSON.parse(doc.config)
                }

                let list = {}
                for (let k in config) {
                    let v = config[k]
                    if (t[k] != null)
                        v = t[k]

                    list[k] = v
                }

                try {
                    fs.mkdirSync(__dirname + '/res/' + qid)
                } catch { }

                SkyDB.findOne({ qid: qid, type: 'sky_bg' }, async (err, doc0) => {
                    if (doc0) {
                        doc0 = doc0.url
                    }
                    SkyDB.findOne({ qid: qid, type: 'sky_ttf' }, async (err, doc) => {
                        let ttf
                        if (doc) {
                            let url = await bot.pickFriend(qid).getFileUrl(doc.fid);
                            if (url.indexOf('fname=') == -1) {
                                url += '&fname=' + doc.name;
                            }
                            ttf = encodeURI(url)
                            let res = await axios({
                                url: ttf,
                                responseType: 'arraybuffer',
                                method: 'get'
                            })

                            fs.writeFileSync(__dirname + '/res/' + qid + '/use.ttf', res.data)
                            ttf = __dirname + '/res/' + qid + '/use.ttf'
                        }

                        Sky({
                            data: data,
                            config: list,
                            ttf: ttf,
                            bg: doc0
                        }).then(async (buff) => {
                            await e.reply([oicq.segment.image(buff)])
                            emptyDir(__dirname + '/res/' + qid)
                            fs.rmdirSync(__dirname + '/res/' + qid)
                            states[qid] = 0
                        }).catch((err) => {
                            e.reply(err)
                            emptyDir(__dirname + '/res/' + qid)
                            fs.rmdirSync(__dirname + '/res/' + qid)
                            states[qid] = 0
                        })
                    })
                })
            })
            break
        case 3:
            let fid = m[0].fid
            if ((!fid) || !/.ttf/.test(m[0].name)) {
                states[qid] = 0
                e.reply('只允许上传ttf文件！')
                break
            }
            SkyDB.remove({ qid: qid, type: 'sky_ttf' }, {}, (err, doc) => {
                SkyDB.insert({ qid: qid, fid: fid, name: m[0].name, type: 'sky_ttf' }, (err, doc) => {
                    states[qid] = 0
                    e.reply('上传成功！')
                })
            })
            break
        case 2:
            let url = m[0].url
            if (!url) {
                states[qid] = 0
                e.reply('只允许上传图片！')
                break
            }
            SkyDB.remove({ qid: qid, type: 'sky_bg' }, {}, (err, doc) => {
                SkyDB.insert({ qid: qid, url: url, type: 'sky_bg' }, (err, doc) => {
                    states[qid] = 0
                    e.reply('上传成功！')
                })
            })
            break
        case 1:
            if (msg == '#提交') {
                SkyDB.remove({ qid: qid, type: 'sky_config' }, {}, (err, doc) => {
                    SkyDB.insert({ qid: qid, config: JSON.stringify(temp), type: 'sky_config' }, (err, doc) => {
                        states[qid] = 0
                        delete temp_config[qid]
                        e.reply('修改成功！')
                    })
                })
                break
            } else if (msg == '#取消') {
                states[qid] = 0
                e.reply('取消成功！')
                break
            }

            if (msgs.length != 2 || key1[msgs[0]] == null) {
                e.reply('格式错误！')
                break
            }

            let v = msgs[1]

            if (v == '开')
                v = true
            else if (v == '关')
                v = false

            temp[key1[msgs[0]]] = v

            break
        case 0:
            if (msg == '#查看配置') {
                let t = {}
                SkyDB.findOne({ qid: qid, type: 'sky_config' }, (err, doc) => {
                    if (doc) {
                        t = JSON.parse(doc.config)
                    }

                    let list = []
                    for (let k in config) {
                        let v = config[k]
                        if (t[k] != null)
                            v = t[k]
                        if (typeof v == 'boolean' || v == null) {
                            if (v)
                                v = '开'
                            else
                                v = '关'
                        }
                        list.push(`${key2[k]}: ${v}`)
                    }
                    e.reply(list.join('\n'))
                })
                break
            } else if (msg == '#修改配置') {
                states[qid] = 1
                e.reply('请用 (属性 值) 格式发送指令，以修改配置属性！\n发送 #提交 可提交更改，#取消 可取消更改！')
                temp_config[qid] = {}
                SkyDB.findOne({ qid: qid, type: 'sky_config' }, (err, doc) => {
                    if (doc) {
                        temp_config[qid] = JSON.parse(doc.config)
                    }
                })
                break
            } else if (msg == '#上传背景') {
                states[qid] = 2
                e.reply('请发送背景图片！')
            } else if (msg == '#上传字体') {
                states[qid] = 3
                e.reply('请发送字体文件！')
            } else if (msg == '#恢复背景') {
                SkyDB.remove({ qid: qid, type: 'sky_bg' }, {})
                e.reply('恢复成功！')
            } else if (msg == '#恢复字体') {
                SkyDB.remove({ qid: qid, type: 'sky_ttf' }, {})
                e.reply('恢复成功！')
            } else if (msg == '#简谱生成') {
                states[qid] = 4
                e.reply('请发送txt文件！')
            }

            if (sender.user_id == myid) {
                if (msgs[0] == '#同意') {
                    let id = Number(msgs[1])

                    DB.findOne({ qqid: id, type: 'user_list' }, (err, docs) => {
                        if (docs || !request_list[id]) {
                            e.reply("处理失败！")
                            return
                        }
                        DB.insert({ qqid: id, type: 'user_list' }, (err, doc) => {
                            e.reply("处理成功！")
                            request_list[id].reply("申请通过！", true)
                            delete request_list[id]
                        })
                    })
                } else if (msgs[0] == '#拒绝') {
                    let id = Number(msgs[1])
                    if (request_list[id]) {
                        request_list[id].reply("申请未通过！", true)
                        delete request_list[id]
                        e.reply("处理成功！")
                    } else
                        e.reply("处理失败！")
                } else if (msgs[0] == '#删除') {
                    let id = Number(msgs[1])

                    DB.findOne({ qqid: id }, (err, docs) => {
                        if (!docs) {
                            e.reply("处理失败！")
                            return
                        }
                        DB.remove({ qqid: id }, { muti: true }, (err, doc) => {
                            e.reply("处理成功！")
                        })
                    })
                } else if (msg == '#申请列表') {
                    let s = []
                    for (let k in request_list) {
                        let sender = request_list[k].sender
                        s.push(sender.nickname + "(" + sender.user_id + ")")
                    }
                    s = s.join('\n')
                    e.reply('申请列表:\n' + s)
                } else if (msg == '#同意全部') {
                    let t = []
                    for (let v of gids)
                        t[v] = ['申请通过！\n']

                    let n = 0
                    for (let k in request_list) {
                        n++
                        let v = request_list[k]
                        let sender = v.sender
                        let id = sender.user_id
                        t[v.group_id].push(oicq.segment.at(id))
                        DB.insert({ qqid: id, type: 'user_list' }, (err, doc) => {
                            delete request_list[id]
                        })
                    }
                    if (n == 0) {
                        e.reply("处理失败！")
                        return
                    }
                    for (let k in t) {
                        let v = t[k]
                        if (v.length > 1) {
                            try {
                                await bot.sendGroupMsg(k, v)
                            } catch (e) {
                                console.log(e)
                            }
                        }
                    }
                    e.reply("处理成功！")
                }
            }
            DB.findOne({ qqid: qid, type: 'user_list' }, async (err, docs) => {
                if (!docs)
                    return
                if (user_data[qid] == null)
                    user_data[qid] = { state: 0 }
                let data = user_data[qid]
                let state = data.state// 0:闲置 1:发送标题 2:发送记录
                switch (state) {
                    case 0: {
                        if (msgs[0] == '#上传') {
                            e.reply("请发送标题，如要放弃请发送 #取消")
                            data.state = 1
                            if (msgs[1])
                                data.form = { qqid: qid, name: sender.nickname, channel: msgs.slice(1), id: Date.now().toString(16), type: "data", msg: [] }
                            else
                                data.form = { qqid: qid, name: sender.nickname, id: Date.now().toString(16), type: "data", msg: [] }
                        } else if (msgs[0] == '#解绑群聊') {
                            if (msgs[1]) {
                                msgs[1] = Number(msgs[1])
                                DB.findOne({ gid: msgs[1], qqid: sender.user_id, type: 'group_list' }, (err, d) => {
                                    if (d) {
                                        DB.remove({ gid: msgs[1], qqid: sender.user_id, type: 'group_list' }, {}, (err, d) => {
                                            e.reply("解绑成功！")
                                        })
                                    } else
                                        e.reply("未绑定该群聊！")
                                })
                            }
                        } else if (msg == '#群列表') {
                            DB.find({ qqid: qid, type: 'group_list' }, async (err, doc) => {
                                if (doc.length == 0) {
                                    e.reply("群列表为空!")
                                    return
                                }
                                let t = []
                                for (let v of doc) {
                                    let c = v.channel
                                    if (c)
                                        c = `\n分组: ${c.join(', ')}`
                                    else
                                        c = ''
                                    t.push(`群号: ${v.gid}\n群名称: ${bot.pickGroup(v.gid).name}${c}`)
                                }
                                t = t.join('\n\n')
                                e.reply(t)
                            })
                        } else if (msgs[0] == '#销毁') {
                            let s = msgs[1]
                            DB.remove({ qqid: qid, type: "data", id: s }, {}, function (err, n) {
                                if (n == 0) {
                                    e.reply("记录id不存在！")
                                    return
                                }
                                e.reply("销毁成功！")
                            })
                        } else if (msgs[0] == '#推送') {
                            let s = msgs[1]
                            DB.findOne({ qqid: qid, type: "data", id: s }, (err, docs) => {
                                if (!docs) {
                                    e.reply("记录id不存在！")
                                    return
                                }
                                let q = { qqid: qid, type: 'group_list' }
                                if (msgs[2])
                                    q.channel = { $in: msgs.slice(2) }
                                DB.find(q, async (err, d0) => {
                                    for (let v0 of d0) {
                                        for (let v of docs.msg) {
                                            try {
                                                await bot.sendGroupMsg(v0.gid, oicq.segment.at('all'))
                                                await bot.sendGroupMsg(v0.gid, v)
                                            } catch (e) {
                                                console.log(e)
                                            }
                                        }
                                    }
                                    await e.reply("推送成功！")
                                })
                            })
                        } else if (msgs[0] == '#检索') {
                            let s = msgs[1]
                            let re = eval("/" + s + "/")
                            await e.reply("正在检索...")
                            DB.find({ $or: [{ qqid: qid, type: "data", id: s }, { qqid: qid, type: "data", title: re }] }, async (err, d) => {
                                if (d.length == 0) {
                                    e.reply("结果为空！")
                                    return
                                }

                                d.sort((a, b) => {
                                    a = a.id, b = b.id
                                    if (a > b)
                                        return -1
                                    else if (a < b)
                                        return 1
                                    return 0
                                })

                                let docs = page(d, 800)
                                for (let doc of docs) {
                                    if (doc.length == 1 && docs.length == 1) {
                                        let v = doc[0]

                                        let str = ''
                                        if (v.channel)
                                            str = `\n分组: ${v.channel.join(', ')}`

                                        let t = [
                                            {
                                                user_id: bot.uin,
                                                nickname: bot.nickname,
                                                time: Date.now(),
                                                message: [{ type: 'text', text: `id: ${v.id}\n标题: ${v.title}${str}` }],
                                            }
                                        ]
                                        for (let v0 of v.msg) {
                                            if (v0[0].type == 'file') {
                                                try {
                                                    let url = await bot.pickFriend(v.qqid).getFileUrl(v0[0].fid);
                                                    if (url.indexOf('fname=') == -1) {
                                                        url += '&fname=' + v0[0].name;
                                                    }
                                                    v0[0] = `文件名称: ${v0[0].name}\n文件大小: ${(v0[0].size / 1024 / 1024).toFixed(2)}MB\n下载链接: ${encodeURI(url)}`
                                                } catch (e) {
                                                    console.log(e)
                                                    continue
                                                }
                                            }
                                            t.push({
                                                user_id: v.qqid,
                                                nickname: v.name,
                                                time: Date.now(),
                                                message: v0
                                            })
                                        }
                                        await e.reply(await bot.makeForwardMsg(t, true))
                                        return
                                    }

                                    let list = [
                                        {
                                            user_id: bot.uin,
                                            nickname: bot.nickname,
                                            time: Date.now(),
                                            message: [
                                                { type: 'text', text: `检索完成，找到${doc.length}条记录！` },
                                            ]
                                        }
                                    ]


                                    for (let v of page(doc, 10)) {
                                        let s = []
                                        for (let v1 of v) {
                                            let str = ''
                                            if (v1.channel)
                                                str = `\n分组: ${v1.channel.join(', ')}`

                                            s.push(`id: ${v1.id}\n标题: ${v1.title}${str}`)
                                        }
                                        list.push({
                                            user_id: bot.uin,
                                            nickname: bot.nickname,
                                            time: Date.now(),
                                            message: [{ type: 'text', text: s.join('\n\n') }],
                                        })
                                    }

                                    e.reply(await bot.makeForwardMsg(list, true))
                                }
                            })
                        }
                        break
                    }
                    case 1: {
                        if (msg == '#取消') {
                            data.state = 0
                            e.reply("取消成功！")
                            break
                        }
                        data.form.title = msg
                        data.state = 2
                        e.reply("请发送记录，完成请发送 #提交，放弃请发送 #取消")
                        break
                    }
                    case 2: {
                        if (msg == '#取消') {
                            data.state = 0
                            e.reply("取消成功！")
                            break
                        } else if (msg == '#提交') {
                            DB.insert(data.form, (err, doc) => {
                                data.state = 0
                                e.reply("提交成功！\n记录id: " + data.form.id)
                            })
                            break
                        }

                        data.form.msg.push(e.message)
                        break
                    }
                }

            })
            break
    }
})


exports.bot = bot

process.on("unhandledRejection", (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason)
})


function page(arr, num) {
    var arrNew = []
    if (arr.length <= num) {
        arrNew.push(arr)
    } else {
        for (var i = 0; i < Math.floor(arr.length / num); i++) {
            arrNew.push(arr.slice(i * num, (i + 1) * num))
            if (i + 1 == Math.floor(arr.length / num) && arr.slice((i + 1) * num).length != 0) {
                arrNew.push(arr.slice((i + 1) * num))
            }
        }
    }
    return arrNew
}


function emptyDir(path) {
    const files = fs.readdirSync(path);
    files.forEach(file => {
        const filePath = `${path}/${file}`;
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            emptyDir(filePath);
        } else {
            fs.unlinkSync(filePath);
        }
    });
}