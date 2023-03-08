import dgram from 'dgram'

const server = dgram.createSocket('udp4')
function parseHost(msg:Buffer): string {
    let num = msg.readUInt8(0);
    let offset = 1;
    let host = "";
    while (num !== 0) {
      host += msg.subarray(offset, offset + num).toString();
      offset += num;
  
      num = msg.readUInt8(offset);
      offset += 1;
  
      if (num !== 0) {
        host += '.'
      }
    }
    return host
}

//转发给本地的DNS服务器
function forward(msg: Buffer, rinfo: dgram.RemoteInfo)
{
    const client = dgram.createSocket('udp4')

    client.on('error', (err) => {
        console.log(`client error:\n${err.stack}`);
        client.close();
    });

    client.on('message', (fbMsg, fbRinfo: dgram.RemoteInfo) => {
        //把本地DNS的回复转发过去客户端
        server.send(fbMsg, rinfo.port, rinfo.address, (err) => {
            err && console.log(err)
        })
        client.close();
    });

    client.send(msg, 53, '114.114.114.114', (err) => {
        if (err) {
            console.log(err)
            client.close()
        }
    });
}

function resolve(msg:Buffer, rinfo:dgram.RemoteInfo)
{
    //原查询
    const queryInfo = msg.subarray(12)
    const response = Buffer.alloc(28 + queryInfo.length)

    let offset = 0

    //sessionid
    msg.copy(response, 0, 0, 2)
    offset += 2

    // Flags，固定设置
    response.writeUint16BE(0x8180, offset)
    offset += 2

    // 问题是 1 个 Question
    response.writeUint16BE(1, offset)
    offset += 2

    // 回答是 1 个 Answer RRs
    response.writeUint16BE(1, offset)
    offset += 2

    // Authority RRs & Additional RRs 数量，都0
    response.writeUInt32BE(0, offset)
    offset += 4

    // query 信息
    queryInfo.copy(response, offset, 0, queryInfo.length)
    offset += queryInfo.length

    // offset to domain name
    // 假如第一个字符头两个bit都是1，那这个域名是个引用。
    // 第二个字符指示真正的域名的包内offset。一般是响应自己要带着query，所以answer部分的域名就会ref到query上缩减数据量。
    // 0xC00C = 1100 0000 0000 1100，1100 = 12，也就是query开始的部分
    // 也可以直接返回指定的域名，参考上面的 parseHost 函数怎么写入host的
    response.writeUInt16BE(0xC00C, offset)
    offset += 2

    // type and class
    msg.copy(response, offset, msg.length - 4)
    offset += 4

    //TTL
    response.writeUint32BE(600, offset)
    offset += 4

    //IP
    response.writeUInt16BE(4, offset) //ip length
    offset += 2
    '11.11.11.11'.split('.').forEach(val=> {
        response.writeUInt8(parseInt(val), offset)
        offset += 1
    })

    //发送回去
    server.send(response, rinfo.port, rinfo.address, (err) =>{
        if(err)
        {
            console.log(err)
            server.close()
        }
    })
}

server.on('message', (msg, rinfo) =>{
    const host = parseHost(msg.subarray(12))
    console.log(`query host:${host}`)

    //测试域名，本地随便解析
    if(/test/.test(host))
    {
        resolve(msg, rinfo)
    }
    else
    {
        //转给本地DNS进行处理
        forward(msg, rinfo)
    }
})

server.on('error', (err) =>{
    console.log(`server error:\n${err.stack}`)
    server.close()
})

server.on('listening', ()=>{
    const address = server.address()
    console.log(`server listeninig ${address.address}:${address.port}`)
})

//DNS local service port
server.bind(53)
