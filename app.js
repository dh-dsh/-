const express = require('express');
const cors = require('cors');
const { init } = require('wx-server-sdk');
require('dotenv').config();

// 小程序配置
const appConfig = {
  appId: process.env.WECHAT_APPID || 'wxc7d9247d7be6b8a4',
  cloudEnv: process.env.CLOUD_ENV || 'cloudbase-d7gx9tb5ee46a6237'
};

// 初始化微信云开发
const cloud = init({
  env: appConfig.cloudEnv
});

const db = cloud.database();
const _ = db.command;

// 创建Express应用
const app = express();
const port = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查接口
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'daikebao-backend',
    appId: appConfig.appId,
    cloudEnv: appConfig.cloudEnv
  });
});

// 根路径
app.get('/', (req, res) => {
  res.json({
    message: '欢迎使用代课宝后端服务',
    version: '1.0.0',
    appId: appConfig.appId,
    endpoints: {
      health: '/health',
      auth: {
        login: '/api/auth/login'
      },
      orders: {
        create: '/api/orders',
        list: '/api/orders',
        myPublished: '/api/orders/my-published',
        myAccepted: '/api/orders/my-accepted'
      },
      user: {
        profile: '/api/user/profile',
        wallet: '/api/user/wallet',
        updateLocation: '/api/user/location'
      },
      payment: {
        prepay: '/api/payment/prepay',
        notify: '/api/payment/notify'
      }
    }
  });
});

// 认证中间件
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ code: 401, message: '未授权' });
  }
  
  try {
    // 验证token
    const user = await db.collection('user').where({
      _id: token
    }).get();
    
    if (user.data.length === 0) {
      return res.status(401).json({ code: 401, message: '无效的token' });
    }
    
    req.userId = token;
    req.userInfo = user.data[0];
    next();
  } catch (error) {
    console.error('认证错误:', error);
    res.status(401).json({ code: 401, message: '认证失败' });
  }
};

// 认证接口
app.post('/api/auth/login', async (req, res) => {
  try {
    const { code } = req.body;
    
    // 模拟微信登录
    console.log('登录请求:', { code, appId: appConfig.appId });
    
    // 模拟用户数据
    const mockUser = {
      openid: 'mock_openid_' + Date.now(),
      name: '测试用户',
      avatar: 'https://via.placeholder.com/100',
      school: '测试大学',
      phone: '13800138000',
      role: 'user'
    };
    
    // 查找或创建用户
    const existingUser = await db.collection('user').where({
      openid: mockUser.openid
    }).get();
    
    let user;
    if (existingUser.data.length === 0) {
      // 创建新用户
      const result = await db.collection('user').add({
        ...mockUser,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      user = {
        _id: result._id,
        ...mockUser,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    } else {
      user = existingUser.data[0];
    }
    
    res.json({
      code: 0,
      data: {
        token: user._id,
        openid: user.openid,
        userInfo: {
          id: user._id,
          nickname: user.name,
          avatar: user.avatar,
          school: user.school,
          verified: true,
          rating: 5.0,
          orderCount: 0
        }
      },
      message: '登录成功'
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// 位置更新接口
app.post('/api/user/location', authMiddleware, async (req, res) => {
  try {
    const { latitude, longitude, address } = req.body;
    
    // 更新用户位置
    await db.collection('user').doc(req.userId).update({
      data: {
        location: new db.Geo.Point(longitude, latitude),
        address: address,
        updatedAt: new Date()
      }
    });
    
    // 记录位置历史
    await db.collection('locationRecord').add({
      userId: req.userId,
      location: new db.Geo.Point(longitude, latitude),
      address: address,
      updateTime: new Date()
    });
    
    res.json({
      code: 0,
      message: '位置更新成功'
    });
  } catch (error) {
    console.error('位置更新错误:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// 订单接口
app.post('/api/orders', authMiddleware, async (req, res) => {
  try {
    const { courseName, courseType, date, timeSlot, location, requirements, reward } = req.body;
    
    const order = await db.collection('order').add({
      userId: req.userId,
      teacherId: null,
      courseName,
      courseType,
      date: new Date(date),
      timeSlot,
      location,
      requirements,
      reward: parseFloat(reward),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    res.json({
      code: 0,
      data: {
        orderId: order._id
      },
      message: '订单发布成功'
    });
  } catch (error) {
    console.error('创建订单错误:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
  try {
    // 获取同校订单
    const orders = await db.collection('order').where({
      status: 'pending'
    }).orderBy('createdAt', 'desc').get();
    
    // 过滤同校订单（简化处理）
    const sameSchoolOrders = orders.data.filter(order => {
      // 实际应该关联查询用户学校
      return true;
    });
    
    res.json({
      code: 0,
      data: {
        list: sameSchoolOrders,
        hasMore: false
      },
      message: '获取订单成功'
    });
  } catch (error) {
    console.error('获取订单错误:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

app.get('/api/orders/my-published', authMiddleware, async (req, res) => {
  try {
    const orders = await db.collection('order').where({
      userId: req.userId
    }).orderBy('createdAt', 'desc').get();
    
    res.json({
      code: 0,
      data: {
        list: orders.data,
        hasMore: false
      },
      message: '获取发布订单成功'
    });
  } catch (error) {
    console.error('获取发布订单错误:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

app.get('/api/orders/my-accepted', authMiddleware, async (req, res) => {
  try {
    const orders = await db.collection('order').where({
      teacherId: req.userId
    }).orderBy('createdAt', 'desc').get();
    
    res.json({
      code: 0,
      data: {
        list: orders.data,
        hasMore: false
      },
      message: '获取接单成功'
    });
  } catch (error) {
    console.error('获取接单错误:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// 支付接口
app.post('/api/payment/prepay', authMiddleware, async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    
    // 模拟预支付
    const prepayId = 'prepay_' + Date.now();
    
    // 记录支付记录
    await db.collection('payRecord').add({
      orderId,
      payNo: 'pay_' + Date.now(),
      payAmount: parseFloat(amount),
      payTime: new Date(),
      status: 'pending'
    });
    
    res.json({
      code: 0,
      data: {
        prepayId,
        paySign: 'mock_sign',
        timeStamp: Date.now().toString(),
        nonceStr: 'mock_nonce',
        appId: appConfig.appId
      },
      message: '预支付成功'
    });
  } catch (error) {
    console.error('预支付错误:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

app.post('/api/payment/notify', async (req, res) => {
  try {
    const paymentInfo = req.body;
    
    // 处理支付回调
    console.log('支付回调:', paymentInfo);
    
    // 更新订单状态
    await db.collection('order').doc(paymentInfo.orderId).update({
      data: {
        status: 'paid',
        updatedAt: new Date()
      }
    });
    
    // 更新支付记录
    await db.collection('payRecord').where({
      orderId: paymentInfo.orderId
    }).update({
      data: {
        status: 'success',
        updatedAt: new Date()
      }
    });
    
    res.json({
      code: 0,
      message: '支付成功'
    });
  } catch (error) {
    console.error('支付回调错误:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// 用户接口
app.get('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const user = await db.collection('user').doc(req.userId).get();
    
    res.json({
      code: 0,
      data: {
        id: user.data._id,
        nickname: user.data.name,
        avatar: user.data.avatar,
        school: user.data.school,
        verified: true,
        rating: 5.0,
        orderCount: 0
      },
      message: '获取用户信息成功'
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

app.get('/api/user/wallet', authMiddleware, async (req, res) => {
  try {
    // 模拟钱包数据
    const wallet = {
      balance: 0.00,
      frozen: 0.00,
      totalEarning: 0.00
    };
    
    res.json({
      code: 0,
      data: wallet,
      message: '获取钱包信息成功'
    });
  } catch (error) {
    console.error('获取钱包信息错误:', error);
    res.status(500).json({ code: 500, message: '服务器错误' });
  }
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    code: 404,
    message: '接口不存在'
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误'
  });
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器运行在端口 ${port}`);
  console.log(`小程序ID: ${appConfig.appId}`);
  console.log(`云开发环境: ${appConfig.cloudEnv}`);
  console.log(`健康检查: http://localhost:${port}/health`);
  console.log(`API文档: http://localhost:${port}/`);
});
