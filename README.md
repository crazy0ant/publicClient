# 二维码分享屏幕JS代码


2020.09.29 dev1分支，部分chrome无法播放问题（暂时不需要解决）
尝试修改信令逻辑（二维码分享屏幕）
1.master先加入到房间
2.client加入到房间并告知master
3.master收到newPeer后创建PC，监听icecandidate ，通知client创建PC
4.client收到通知，创建PC，监听icecandidate 和ontrack，通知master创建成功
5.master收到通知，添加本地track到本地PeerConnection，然后创建offer
