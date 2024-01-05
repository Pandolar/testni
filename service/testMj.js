const axios = require('axios')

const url = `https://mj-proxy.xsifan.cn/mj/draw`
const authorization = 'MTA5NzQwNzU0NTc1MDA3NzQ2MQ.G312yC.VsVTNIXagYqppCJ6DW2eoWMdQYc-G-rMxqmzOw'
const headers = { authorization };
const guild_id = '1097409128491651132'
const channel_id ='1109782665743306813'
const message_id = '1130568528806805644'
const application_id = '936929561302675456'
const session_id = '91758da2784763f70fa80513b8b7f4c0'

/* 绘画 */

/* 放大 */
const data = {
  "type": 3,
  "nonce": "1130893222994771968",
  "guild_id": "1097409128491651132",
  "channel_id": "1109782665743306813",
  "message_flags": 0,
  "message_id": "1130892220002742293",
  "application_id": "936929561302675456",
  "session_id": "74bd71074ba40fe61ec73114af5a1862",
  "data": {
      "component_type": 2,
      "custom_id": "MJ::JOB::reroll::0::9b3f878b-3ffc-4bba-ad08-2e11a2e42783::SOLO"
  }
}
/* 变体 */

/* zoomIn 无限缩放 */

/* Vary(Strong) 极大变化  Vary(Subtle)微小变化  */

const a = {
  "type": 3,
  "guild_id": "1097409128491651132",
  "channel_id": "1109782665743306813",
  "message_id": "1130914671675842602",
  "application_id": "936929561302675456",
  "session_id": "cce55d7683f8bfb9fa168f8d60886365",
  "data": {
      "component_type": 2,
      "custom_id": "MJ::JOB::low_variation::1::598e13a3-d996-44c6-9bb2-159a5d958f53::SOLO"
  }
}

/* 查询结果 */

async function zoomIn(){
  const body = {
    type: 3,
    guild_id,
    channel_id,
    message_id,
    application_id,
    session_id,
    data: {
      component_type: 2,
      custom_id: "MJ::JOB::low_variation::1::e88bb38d-cce1-4d82-b090-69bc9bccc032::SOLO"
    }
  }

  await axios.post(url, body, { headers });
}


try {
  zoomIn().then(res => {
    console.log(res)
  }).catch(err => {
    console.log(err)
  })
} catch (error) {
  console.log('error---->: ', error);
  
}