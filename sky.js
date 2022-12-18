const { Canvas, Image, FontLibrary } = require('skia-canvas')
module.exports = Sky
function Sky(Datas) {
    return new Promise(async (resolve, reject) => {
        try {
            let data = Datas.data
            let cf = Datas.config
            var config = {
                Color_Overlay: true,
                Image_Overlay: false,
                Stroke_Overlay: true,
                Background_Color: '#141E17',
                Stroke_Color: '#fff',
                Text_Color: '#fff',
                Line_Color: '#fff',
                Number_Color: '#fff',
                Sign_Color: `rgba(255,255,255,${0x10 / 0xff})`
            }

            for (let k in cf)
                config[k] = hex2rgba(cf[k])

            function to(str) {
                str ||= ""
                return (str == 'Unknown' || str == "" || str == " ") && '未知' || str
            }

            function hex2rgba(hex) {
                if (typeof hex != 'string')
                    return hex
                if ((hex.length - 1) % 4 > 0)
                    return hex
                let sHex = hex.replace('#', '');

                // 4位格式 hex
                if (sHex.length === 4) {
                    let sHexTemp = '';
                    for (let i = 0; i < 4; i++) {
                        sHexTemp = sHexTemp.concat(sHex[i], sHex[i])
                    }
                    sHex = sHexTemp;
                }

                const a = parseInt(sHex.substring(0, 2), 16);
                const r = parseInt(sHex.substring(2, 4), 16);
                const g = parseInt(sHex.substring(4, 6), 16);
                const b = parseInt(sHex.substring(6, 8), 16);

                return `rgba(${r},${g},${b},${a / 0xff})`;
            }


            var level = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']

            if (data[0].isEncrypted)
                reject('不支持已加密的乐谱！')
            else {
                FontLibrary.reset()
                FontLibrary.use('use', [
                    Datas.ttf || __dirname + "/res/use.ttf"
                ])

                let sheet = []
                let last
                let data = Datas.data[0]

                let notes = data.songNotes
                for (let k in notes) {
                    let v = notes[k]
                    if (v.time != last) {
                        last ||= 0
                        for (let i = 0; i <= Math.floor((v.time - last) / 60000 * data.bpm); i++) {
                            sheet.push({ list: [], node: [], num1: 0, num2: 0 })
                        }
                        last = v.time
                    }
                    let sk = v.key.match(/\d+/g)
                    let sign = sk[0], key = Number(sk[1]) + 1
                    if (sheet[sheet.length - 1].list[key - 1])
                        continue
                    else
                        sheet[sheet.length - 1].list[key - 1] = true

                    if (sign != '1')
                        sheet[sheet.length - 1].num2 += 1
                    else
                        sheet[sheet.length - 1].num1 += 1

                    sheet[sheet.length - 1].node.push({
                        sign: sign != '1',
                        key: key,
                        dd: v.dd
                    })
                }

                let line_height = []
                let note_height = 41
                let len = Math.ceil((sheet.length) / (data.bitsPerPage * 2))

                for (let i = 1; i <= len; i++) {
                    let n = 0, n2 = 0
                    for (let i0 = 1; i0 <= data.bitsPerPage * 2; i0++) {
                        if (i0 + ((i - 1) * data.bitsPerPage * 2) > sheet.length)
                            break

                        let h = sheet[i0 + ((i - 1) * data.bitsPerPage * 2) - 1].num1
                        let h2 = sheet[i0 + ((i - 1) * data.bitsPerPage * 2) - 1].num2
                        n = Math.max(h, n)
                        n2 = Math.max(h2, n2)
                    }

                    line_height.push([n, n2])
                }

                let l = 0
                for (let k in line_height) {
                    let v = line_height[k]
                    l += ((v[0] + v[1] + 3) * note_height)
                }

                let w = 1080, h = 547 + l + 547
                function draw(ca, image) {
                    ca.lineCap = "round"
                    ca.fillStyle = config.Background_Color

                    if (config.Image_Overlay) {
                        let img0 = image[0], img1 = image[1]
                        let img = img0, img_w = img1.width, img_h = img1.height
                        img_h = (1080 / img_w) * img_h
                        img_w = 1080
                        let count = (h + img_h - 1) / img_h
                        for (let idx = 1; idx <= count; idx++)
                            ca.drawImage(img, 0, ((idx - 1) * img_h) - idx, img_w, img_h)
                    }

                    if (config.Color_Overlay)
                        ca.fillRect(0, 0, w, h)

                    ca.strokeStyle = config.Stroke_Color
                    ca.lineWidth = 14
                    if (config.Stroke_Overlay)
                        ca.strokeRect(7, 7, w - 14, h - 14)

                    ca.fillStyle = config.Text_Color
                    ca.font = "60px use";
                    ca.textAlign = "center"
                    ca.fillText(to(data.name), w / 2, 300)

                    ca.font = "30px use";
                    ca.textAlign = "right"
                    ca.fillText(`作者：${to(data.author)}`, w - 80, 400)
                    ca.fillText(`改编者：${to(data.transcribedBy)}`, w - 80, 450)

                    ca.textAlign = "left"
                    ca.fillText(`1 = ${level[data.pitchLevel]} ${data.bitsPerPage / 4}/4`, 80, 400)
                    ca.fillText(`B = ${data.bpm}`, 80, 450)

                    let dd = []
                    let _n = data.bitsPerPage / 2
                    let da = []
                    let p = 547
                    let lines = [], points = []

                    for (let i = 1; i <= len; i++) {
                        ca.fillStyle = config.Number_Color
                        ca.font = "22px use";
                        ca.textAlign = "right"
                        ca.fillText(`(${1 + ((i - 1) * 4)})`, 80, p - 10)
                        lines.push(80)
                        lines.push(p)
                        lines.push(80)
                        lines.push(p + ((line_height[i - 1][0] + line_height[i - 1][1] + 1) * note_height))

                        lines.push(w - 80)
                        lines.push(p)
                        lines.push(w - 80)
                        lines.push(p + ((line_height[i - 1][0] + line_height[i - 1][1] + 1) * note_height))

                        lines.push(310)
                        lines.push(p)
                        lines.push(310)
                        lines.push(p + ((line_height[i - 1][0] + line_height[i - 1][1] + 1) * note_height))

                        lines.push(w - 310)
                        lines.push(p)
                        lines.push(w - 310)
                        lines.push(p + ((line_height[i - 1][0] + line_height[i - 1][1] + 1) * note_height))

                        lines.push(w / 2)
                        lines.push(p)
                        lines.push(w / 2)
                        lines.push(p + ((line_height[i - 1][0] + line_height[i - 1][1] + 1) * note_height))

                        da.push(p + ((line_height[i - 1][0] + line_height[i - 1][1] + 1) * note_height))

                        if (line_height[i - 1][1] > 0) {
                            ca.fillStyle = config.Sign_Color
                            let x = 80, y = p + (note_height / 2)
                            ca.fillRect(x, y, w - 80 - x, (p + (note_height / 2) + (line_height[i - 1][1] * note_height)) - y)
                        }

                        for (let i0 = 1; i0 <= data.bitsPerPage * 2; i0++) {
                            if (i0 + ((i - 1) * data.bitsPerPage * 2) > sheet.length)
                                break

                            let t0 = sheet[i0 + ((i - 1) * data.bitsPerPage * 2) - 1]
                            let node = t0.node
                            if (node.length > 0) {
                                for (let k in dd) {
                                    let v = dd[k]
                                    if (v[0] < 1)
                                        delete dd[k]
                                }
                            }


                            let n01 = 1, n02 = 1
                            let t1 = []
                            for (let k in dd) {
                                let v = dd[k]
                                if (v[0] < 1) continue
                                v[0] -= 1
                                v = v[1]
                                if (t1[v.key - 1]) continue
                                t1[v.key] = true
                                let x = 85 + (210 * ((i0 - 1) / _n)) + (10 * (Math.floor((i0 - 1) / _n))) + (10 * (Math.ceil(i0 / _n))) + 6
                                if (v.sign) {
                                    for (let i = 1; i <= Math.floor(v.key / 7); i++) {
                                        if (v.key / 7 == i)
                                            break
                                    }
                                    ca.fillStyle = config.Text_Color
                                    ca.font = "30px use";
                                    ca.textAlign = "center"
                                    ca.fillText('-', x, p + (note_height * n01) + 14)
                                    n01 += 1
                                } else {
                                    for (let i1 = 1; i1 <= Math.floor(i1 <= v.key / 7); i1++) {
                                        if (v.key / 7 == i1)
                                            break
                                    }
                                    ca.fillStyle = config.Text_Color
                                    ca.font = "30px use";
                                    ca.textAlign = "center"
                                    ca.fillText('-', x, p + 14 + (note_height * n02) + (line_height[i - 1][1] * note_height))
                                    n02 += 1
                                }
                            }



                            node = node.sort(function (a, b) {
                                return b.key - a.key
                            })
                            let n1 = 1, n2 = 1
                            let t = []
                            for (let k in node) {
                                let v = node[k]
                                if (t[v.key - 1])
                                    continue
                                t[v.key - 1] = true
                                let x = 85 + (210 * ((i0 - 1) / _n)) + (10 * (Math.floor((i0 - 1) / _n))) + (10 * (Math.ceil(i0 / _n))) + 6
                                if (v.sign) {
                                    for (let i = 1; i <= v.key / 7; i++) {
                                        if (v.key / 7 == i)
                                            break

                                        points.push(x)
                                        points.push(p + (note_height * n1) - 2 - (_n * (i - 1)) - 14)
                                    }
                                    ca.fillStyle = config.Text_Color
                                    ca.font = "30px use";
                                    ca.textAlign = "center"
                                    ca.fillText(String(v.key % 7 == 0 && 7 || v.key % 7), x, p + (note_height * n1) + 14)
                                    n1 += 1
                                } else {
                                    for (let i1 = 1; i1 <= Math.floor(v.key / 7); i1++) {
                                        if (v.key / 7 == i1)
                                            break
                                        points.push(x)
                                        points.push(p + (note_height * n2) + (line_height[i - 1][1] * note_height) - 2 - (_n * (i1 - 1)) - 14)
                                    }
                                    ca.fillStyle = config.Text_Color
                                    ca.font = "30px use";
                                    ca.textAlign = "center"
                                    ca.fillText(String(v.key % 7 == 0 && 7 || v.key % 7), x, p + 14 + (note_height * n2) + (line_height[i - 1][1] * note_height))
                                    n2 += 1
                                }
                                if (v.dd)
                                    dd.push([Math.floor((v.dd - 1) / 60000 * data.bpm) - 1, v])
                            }
                        }
                        p += ((line_height[i - 1][0] + line_height[i - 1][1] + 3) * note_height)
                    }

                    ca.beginPath()
                    for (let i = 0; i <= lines.length - 1; i = i + 4) {
                        let s1 = lines[i], e1 = lines[i + 1]
                        ca.moveTo(s1, e1)
                        let s2 = lines[i + 2], e2 = lines[i + 3]
                        ca.lineTo(s2, e2)
                    }
                    ca.strokeStyle = config.Line_Color
                    ca.lineWidth = 5
                    ca.stroke()

                    ca.beginPath()
                    for (let i = 0; i <= points.length - 1; i = i + 2) {
                        let x = points[i], y = points[i + 1]
                        ca.moveTo(x, y)
                        ca.lineTo(x, y)
                    }
                    ca.strokeStyle = config.Text_Color
                    ca.lineWidth = 5
                    ca.stroke()
                }

                if (config.Image_Overlay) {
                    let img = new Image()
                    img.onload = async function () {
                        let canvas = new Canvas(w, h)
                        console.log(canvas.gpu)
                        let ctx = canvas.getContext("2d")
                        let obj = {
                            width: img.width,
                            height: img.height,
                        }
                        draw(ctx, [img, obj])
                        resolve(await canvas.png)
                    }
                    img.src = Datas.bg || __dirname + '/res/bg.png'
                } else {
                    let canvas = new Canvas(w, h)
                    console.log(canvas.gpu)
                    let ctx = canvas.getContext("2d")
                    draw(ctx)
                    resolve(await canvas.png)
                }
            }
        } catch (e) {
            reject('程序出错: ' + e)
        }
    })
}
