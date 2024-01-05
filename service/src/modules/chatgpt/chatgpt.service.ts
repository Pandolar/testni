import { UploadService } from './../upload/upload.service';
import { UserService } from './../user/user.service';
import { ConfigService } from 'nestjs-config';
import { HttpException, HttpStatus, Injectable, OnModuleInit, Logger } from '@nestjs/common';
import type { ChatGPTAPIOptions, ChatMessage, SendMessageOptions } from 'chatgpt-nine-ai';
import { Request, Response } from 'express';
import { OpenAiErrorCodeMessage } from '@/common/constants/errorMessage.constant';
import {
  compileNetwork,
  getClientIp,
  hideString,
  importDynamic,
  isNotEmptyString,
  maskEmail,
  removeSpecialCharacters,
  selectKeyWithWeight,
} from '@/common/utils';
import axios from 'axios';
import { UserBalanceService } from '../userBalance/userBalance.service';
import { DeductionKey } from '@/common/constants/balance.constant';
import { ChatLogService } from '../chatLog/chatLog.service';
import { ChatDrawDto } from './dto/chatDraw.dto';
import * as uuid from 'uuid';
import * as jimp from 'jimp';
import { ConfigEntity } from '../globalConfig/config.entity';
import { In, Like, MoreThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { getRandomItem } from '@/common/utils/getRandomItem';
import { BadwordsService } from '../badwords/badwords.service';
import { AutoreplyService } from '../autoreply/autoreply.service';
import { GptKeysEntity } from './gptkeys.entity';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';
import { AddKeyDto } from './dto/addKey.dto';
import { GetKeyListDto } from './dto/getKeyList.dto';
import { UpdateKeyDto } from './dto/updateKey.dto';
import { WhiteListEntity } from './whiteList.entity';
import { AddWhiteUserDto } from './dto/addWhiteUser.dto';
import { UserEntity } from '../user/user.entity';
import { UpdateWhiteUserDto } from './dto/updateWhiteUser.dto';
import { DeleteKeyDto } from './dto/deleteKey.dto';
import { FanyiService } from '../fanyi/fanyi.service';
import * as dayjs from 'dayjs';
import { BulkCreateKeyDto } from './dto/bulkCreateKey.dto';
import { AppEntity } from '../app/app.entity';
import { ChatGroupService } from '../chatGroup/chatGroup.service';
import { ModelsService } from '../models/models.service';
import { sendMessageFromBaidu } from './baidu';
import { addOneIfOdd, unifiedFormattingResponse } from './helper';
import { MessageInfo, NineStore, NineStoreInterface } from './store';
import { sendMessageFromZhipu } from './zhipu';

interface Key {
  id: number;
  key: string;
  weight: number;
  model: string;
  maxModelTokens: number;
  maxResponseTokens: number;
  openaiProxyUrl: string;
  openaiTimeoutMs: number;
}

@Injectable()
export class ChatgptService implements OnModuleInit {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userEntity: Repository<UserEntity>,
    @InjectRepository(GptKeysEntity)
    private readonly gptKeysEntity: Repository<GptKeysEntity>,
    @InjectRepository(ConfigEntity)
    private readonly configEntity: Repository<ConfigEntity>,
    @InjectRepository(WhiteListEntity)
    private readonly whiteListEntity: Repository<WhiteListEntity>,
    @InjectRepository(AppEntity)
    private readonly appEntity: Repository<AppEntity>,
    private readonly configService: ConfigService,
    private readonly userBalanceService: UserBalanceService,
    private readonly chatLogService: ChatLogService,
    private readonly userService: UserService,
    private readonly uploadService: UploadService,
    private readonly badwordsService: BadwordsService,
    private readonly autoreplyService: AutoreplyService,
    private readonly globalConfigService: GlobalConfigService,
    private readonly fanyiService: FanyiService,
    private readonly chatGroupService: ChatGroupService,
    private readonly modelsService: ModelsService
  ) { }


  private api;
  private nineStore: NineStoreInterface = null; // redis存储
  private whiteListUser: number[] = [];
  private keyPool: {
    list3: Key[];
    list4: Key[];
  } = {
      list3: [],
      list4: [],
    };

  async onModuleInit() {
    let chatgpt = await importDynamic('chatgpt-nine-ai');
    let KeyvRedis = await importDynamic('@keyv/redis');
    let Keyv = await importDynamic('keyv');
    chatgpt = chatgpt?.default ? chatgpt.default : chatgpt;
    KeyvRedis = KeyvRedis?.default ? KeyvRedis.default : KeyvRedis;
    Keyv = Keyv?.default ? Keyv.default : Keyv;
    const { ChatGPTAPI, ChatGPTError, ChatGPTUnofficialProxyAPI } = chatgpt;
    /* get custom set default config */
    const defaultBase = 'https://api.openai.com';
    const port = +process.env.REDIS_PORT;
    const host = process.env.REDIS_HOST;
    const password = process.env.REDIS_PASSWORD;
    const username = process.env.REDIS_USER;
    const redisUrl = `redis://${username || ''}:${password || ''}@${host}:${port}`;
    const store = new KeyvRedis(redisUrl);
    const messageStore = new Keyv({ store, namespace: 'nineai-chatlog' });
    this.nineStore = new NineStore({ store: messageStore, namespace: 'chat' })
    this.api = new ChatGPTAPI({
      apiKey: 'nine-ai-default-key',
      apiBaseUrl: `${defaultBase}/v1`,
      messageStore,
    });
  }

  /* 随机获取一个key type 3 | 4 区分3和4的卡池 */
  async getRandomGptKeyDetail(type) {
    const { list3, list4 } = this.keyPool;
    if (list3.length === 0 && list4.length === 0) {
      throw new HttpException('未配置有效key、请先前往后台系统配置！', HttpStatus.BAD_REQUEST);
    }

    if (type === 3) {
      if (list3.length === 0) {
        throw new HttpException('未配置[卡池3]的有效key、请先前往后台系统配置！', HttpStatus.BAD_REQUEST);
      }
      return selectKeyWithWeight(list3);
    }

    if (type === 4) {
      if (list4.length === 0) {
        const openaiaAtoDowngrade = await this.globalConfigService.getConfigs(['openaiaAtoDowngrade']);
        if (Number(openaiaAtoDowngrade) !== 1) {
          throw new HttpException('未配置[卡池4]的有效key、请先前往后台系统配置！', HttpStatus.BAD_REQUEST);
        }
        Logger.error(`有4的权限但是卡池没有配置、降级为3的卡池`);
        if (list3.length === 0) {
          throw new HttpException('未配置有效key、请先前往后台系统配置！', HttpStatus.BAD_REQUEST);
        } else {
          return selectKeyWithWeight(list3);
        }
      } else {
        return selectKeyWithWeight(list4);
      }
    }
  }

  /* 整理请求的所有入参 */
  async getRequestParams(inputOpt, systemMessage, currentRequestModelKey, modelInfo = null) {
    if(!modelInfo){
      modelInfo = (await this.modelsService.getBaseConfig())?.modelInfo
    }
    const { timeout = 60 } = currentRequestModelKey
    const { topN: temperature, model } = modelInfo
    const { parentMessageId = 0 } = inputOpt;
    /* 根据用户区分不同模型使用不同的key */
    const globalTimeoutMs: any = await this.globalConfigService.getConfigs(['openaiTimeoutMs']);
    const timeoutMs = timeout * 1000 || globalTimeoutMs || 100 * 1000;
    const options: any = {
      parentMessageId,
      timeoutMs: +timeoutMs,
      completionParams: {
        model,
        temperature: temperature, // 温度 使用什么采样温度，介于 0 和 2 之间。较高的值（如 0.8）将使输出更加随机，而较低的值（如 0.2）将使输出更加集中和确定
      },
    };
    systemMessage && (options.systemMessage = systemMessage);
    return options
  }

  async chatSyncFree(prompt: string){
    const currentRequestModelKey = await this.modelsService.getRandomDrawKey()
    let setSystemMessage  = await this.globalConfigService.getConfigs(['systemPreMessage']);
    const mergedOptions: any = await this.getRequestParams({}, setSystemMessage, currentRequestModelKey);
    const { maxModelTokens = 8000, maxResponseTokens = 4096, key } = currentRequestModelKey
    const proxyUrl = await this.getModelProxyUrl(currentRequestModelKey)
    /* 修改基础调用配置信息 */
    this.api.apiKey = removeSpecialCharacters(key);
    this.api.apiBaseUrl = `${proxyUrl}/v1`;
    this.api.maxModelTokens = maxModelTokens;
    this.api.maxResponseTokens = maxResponseTokens >= maxModelTokens ? Math.abs(Math.floor(maxModelTokens / 2)) : maxResponseTokens;
    const response = await this.api.sendMessage(prompt, mergedOptions);
    return response?.text
  }

  /* 有res流回复 没有同步回复 */
  async chatProcess(body: any, req: Request, res?: Response) {
    const abortController = req.abortController;
    const { options = {}, appId, cusromPrompt, systemMessage = '' } = body;
    /* 不同场景会变更其信息 */
    let setSystemMessage  = systemMessage
    const { parentMessageId } = options
    const { prompt } = body;
    const { groupId, usingNetwork } = options;
    // const { model = 3 } = options;
    /* 获取当前对话组的详细配置信息 */
    const groupInfo = await this.chatGroupService.getGroupInfoFromId(groupId)
    /* 当前对话组关于对话的配置信息 */
    const groupConfig = groupInfo?.config ? JSON.parse(groupInfo.config) : await this.modelsService.getBaseConfig()
    const { keyType, model, topN: temperature, systemMessage: customSystemMessage, rounds } = groupConfig.modelInfo
    /* 获取到本次需要调用的key */
    let currentRequestModelKey = null
    if(!cusromPrompt){
      currentRequestModelKey = await this.modelsService.getCurrentModelKeyInfo(model)
    }else{
      currentRequestModelKey = await this.modelsService.getRandomDrawKey()
    }
    if (!currentRequestModelKey) {
      throw new HttpException('当前流程所需要的模型已被管理员下架、请联系管理员上架专属模型！', HttpStatus.BAD_REQUEST)
    }

    const { deduct, deductType, key: modelKey, secret, modelName, id: keyId, accessToken } = currentRequestModelKey
    /* 用户状态检测 */
    await this.userService.checkUserStatus(req.user);
    /* 用户余额检测 */
    await this.userBalanceService.validateBalance(req, deductType === 1 ? 'model3' : 'model4', deduct);
    res && res.setHeader('Content-type', 'application/octet-stream; charset=utf-8');
    /* 敏感词检测 */
    await this.badwordsService.checkBadWords(prompt, req.user.id);
    /* 自动回复 */
    const autoReplyRes = await this.autoreplyService.checkAutoReply(prompt);
    if (autoReplyRes && res) {
      const msg = { message: autoReplyRes, code: 500 };
      res.write(JSON.stringify(msg));
      return res.end();
    }

    /* 如果传入了appId 那么appId优先级更高 */
    if (appId) {
      const appInfo = await this.appEntity.findOne({ where: { id: appId, status: In([1, 3, 4, 5]) } });
      if (!appInfo) {
        throw new HttpException('你当前使用的应用已被下架、请删除当前对话开启新的对话吧！', HttpStatus.BAD_REQUEST);
      }
      appInfo.preset && (setSystemMessage = appInfo.preset);
    } else if (cusromPrompt) { // 特殊场景系统预设 在co层直接改写
      //自定义提示词 特殊场景  思维导图 翻译 联想 不和头部预设结合
      setSystemMessage = systemMessage;
    } else if(customSystemMessage){ // 用户自定义的预设信息
      setSystemMessage = customSystemMessage
    } else{ // 走系统默认预设
      const currentDate = new Date().toISOString().split('T')[0];
      const systemPreMessage = await this.globalConfigService.getConfigs(['systemPreMessage']);
      setSystemMessage = systemPreMessage + `\n Respond using markdown. \n Current date: ${currentDate}`;
    }

    let netWorkPrompt = '';
    /* 使用联网模式 */
    if (usingNetwork) {
      netWorkPrompt = await compileNetwork(prompt);
      const currentDate = new Date().toISOString().split('T')[0];
      const systemPreMessage = await this.globalConfigService.getConfigs(['systemPreMessage']);
      setSystemMessage = systemPreMessage + `\n Respond using markdown. \n Current date: ${currentDate}`;
    }

    /* 整理本次请求全部数据 */
    const mergedOptions: any = await this.getRequestParams(options, setSystemMessage, currentRequestModelKey, groupConfig.modelInfo);

    const { maxModelTokens = 8000, maxResponseTokens = 4096, key } = currentRequestModelKey

    /* 修改基础调用配置信息 */
    if( Number(keyType) === 1){
      const { key,maxToken,maxTokenRes, proxyResUrl } = await this.formatModelToken(currentRequestModelKey);
      console.log('maxToken,maxTokenRes: ',key,proxyResUrl, maxToken,maxTokenRes);
      this.api.apiKey = removeSpecialCharacters(key);
      this.api.apiBaseUrl = `${proxyResUrl}/v1`;
      this.api.maxModelTokens = maxToken;
      this.api.maxResponseTokens = maxTokenRes;
    }
    res && res.status(200);
    let response = null;
    let othersInfo = null
    try {
      if (res) {
        let lastChat: ChatMessage | null = null;
        let isSuccess = false;
        /* 如果客户端终止请求、我们只存入终止前获取的内容、并且终止此次请求 拿到最后一次数据 虚构一个结构用户后续信息存入 */
        res.on('close', async () => {
          if (isSuccess) return;
          abortController.abort();

          const prompt_tokens = (await this.api.getTokenCount(prompt)) || 0;
          const completion_tokens = await this.api.getTokenCount(lastChat?.text || '');
          const total_tokens = prompt_tokens + completion_tokens;

          /* 日志记录  */
          const curIp = getClientIp(req);
          /* 用户询问 */
          await this.chatLogService.saveChatLog({
            appId,
            curIp,
            userId: req.user.id,
            type: DeductionKey.CHAT_TYPE,
            prompt,
            answer: '',
            promptTokens: prompt_tokens,
            completionTokens: 0,
            totalTokens: prompt_tokens,
            model: model,
            role: 'user',
            groupId,
            requestOptions: JSON.stringify({
              options: null,
              prompt,
            }),
          });

          // gpt回答
          await this.chatLogService.saveChatLog({
            appId,
            curIp,
            userId: req.user.id,
            type: DeductionKey.CHAT_TYPE,
            prompt: prompt,
            answer: lastChat?.text,
            promptTokens: prompt_tokens,
            completionTokens: completion_tokens,
            totalTokens: total_tokens,
            model: model,
            role: 'assistant',
            groupId,
            requestOptions: JSON.stringify({
              options: {
                model: model,
                temperature,
              },
              prompt,
            }),
            conversationOptions: JSON.stringify({
              conversationId: lastChat?.conversationId,
              model: model,
              parentMessageId: lastChat?.id,
              temperature,
            }),
          });

          /* 当用户回答一般停止时 也需要扣费 */
          await this.userBalanceService.deductFromBalance(req.user.id, `model${deductType === 1 ? 3 : 4}`, 1, total_tokens);
        });


        /* openAi */
        if (Number(keyType) === 1) {
          let firstChunk = true;

          response = await this.api.sendMessage(usingNetwork ? netWorkPrompt : prompt, {
            ...mergedOptions,
            onProgress: (chat: ChatMessage) => {
              res.write(firstChunk ? JSON.stringify(chat) : `\n${JSON.stringify(chat)}`);
              firstChunk = false;
              lastChat = chat;
            },
            abortSignal: abortController.signal,
          });
          isSuccess = true;
        }

        /* 百度文心 */
        if (Number(keyType) === 2) {
          let firstChunk = true;
          const messagesHistory = await this.nineStore.buildMessageFromParentMessageId(usingNetwork ? netWorkPrompt : prompt, { parentMessageId, maxRounds: addOneIfOdd(rounds) })
          response = await sendMessageFromBaidu(usingNetwork ? netWorkPrompt : messagesHistory, {
            temperature,
            accessToken,
            model,
            onProgress: (data) => {
              /* 余额使用完了 */
              // const { error_code, error_msg } = data
              // if( error_code === 17 && error_msg === 'Open api daily request limit reached )
              res.write(firstChunk ? JSON.stringify(data) : `\n${JSON.stringify(data)}`);
              firstChunk = false;

              lastChat = data;
            },
          })
          isSuccess = true;
        }

        /* 清华智谱 */
        if (Number(keyType) === 3) {
          let firstChunk = true;
          const messagesHistory = await this.nineStore.buildMessageFromParentMessageId(usingNetwork ? netWorkPrompt : prompt, { parentMessageId, maxRounds: addOneIfOdd(rounds) })
          response = await sendMessageFromZhipu(usingNetwork ? netWorkPrompt : messagesHistory, {
            temperature,
            key,
            model,
            onProgress: (data) => {
              res.write(firstChunk ? JSON.stringify(data) : `\n${JSON.stringify(data)}`);
              firstChunk = false;
              lastChat = data;
            },
          })
          isSuccess = true;
        }

        /* 分别将本次用户输入的 和 机器人返回的分两次存入到 store */
        const userMessageData: MessageInfo = {
          id: this.nineStore.getUuid(),
          text: prompt,
          role: 'user',
          name: undefined,
          usage: null,
          parentMessageId: parentMessageId,
          conversationId: response?.conversationId
        }

        othersInfo = { model, parentMessageId }

        await this.nineStore.setData(userMessageData)

        const assistantMessageData: MessageInfo = {
          id: response.id,
          text: response.text,
          role: 'assistant',
          name: undefined,
          usage: response.usage,
          parentMessageId: userMessageData.id,
          conversationId: response?.conversationId
        }

        await this.nineStore.setData(assistantMessageData)

        othersInfo = { model, parentMessageId: userMessageData.id }
        /* 回答完毕 */
      } else {
        response = await this.api.sendMessage(usingNetwork ? netWorkPrompt : prompt, mergedOptions);
      }


      /* 统一最终输出格式 */
      const formatResponse = await unifiedFormattingResponse(keyType, response, othersInfo)
      const { prompt_tokens = 0, completion_tokens = 0, total_tokens = 0 } = formatResponse.usage;

      /* 区分扣除普通还是高级余额  model3: 普通余额  model4： 高级余额 */
      await this.userBalanceService.deductFromBalance(req.user.id, `model${deductType === 1 ? 3 : 4}`, deduct, total_tokens);

      /* 记录key的使用次数 和使用token */
      await this.modelsService.saveUseLog(keyId, total_tokens)

      const curIp = getClientIp(req);

      /* 用户询问 */
      await this.chatLogService.saveChatLog({
        appId,
        curIp,
        userId: req.user.id,
        type: DeductionKey.CHAT_TYPE,
        prompt,
        answer: '',
        promptTokens: prompt_tokens,
        completionTokens: 0,
        totalTokens: total_tokens,
        model: formatResponse.model,
        role: 'user',
        groupId,
        requestOptions: JSON.stringify({
          options: null,
          prompt,
        }),
      });

      // gpt回答
      await this.chatLogService.saveChatLog({
        appId,
        curIp,
        userId: req.user.id,
        type: DeductionKey.CHAT_TYPE,
        prompt: prompt,
        answer: formatResponse?.text,
        promptTokens: prompt_tokens,
        completionTokens: completion_tokens,
        totalTokens: total_tokens,
        model: model,
        role: 'assistant',
        groupId,
        requestOptions: JSON.stringify({
          options: {
            model: model,
            temperature,
          },
          prompt,
        }),
        conversationOptions: JSON.stringify({
          conversationId: response.conversationId,
          model: model,
          parentMessageId: response.id,
          temperature,
        }),
      });
      Logger.debug(`本次调用: ${req.user.id} model: ${model} key -> ${key}, 模型名称: ${modelName}, 模型token: ${maxModelTokens}, 最大回复token: ${maxResponseTokens}`, 'ChatgptService' );
      const userBalance = await this.userBalanceService.queryUserBalance(req.user.id);
      response.userBanance = { ...userBalance };
      response.result && (response.result = '')
      response.is_end = true //本次才是表示真的结束
      if (res) {
        return res.write(`\n${JSON.stringify(response)}`);
      } else {
        return response.text;
      }
    } catch (error) {
      console.log('chat-error',modelKey,  error.message );
      const code = error.statusCode;

      if (error.status && error.status === 402) {
        const errMsg = { message: `Catch Error ${error.message}`, code: 402 };
        if (res) {
          return res.write(JSON.stringify(errMsg));
        } else {
          throw new HttpException(error.message, HttpStatus.PAYMENT_REQUIRED);
        }
      }
      
      if (!code) {
        if (res) {
          return res.write(JSON.stringify({ message: error.message, code: 500 }));
        } else {
          throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
        }
      }

      let message = OpenAiErrorCodeMessage[code] ? OpenAiErrorCodeMessage[code] : '服务异常、请重新试试吧！！！';

      if (error?.message.includes('The OpenAI account associated with this API key has been deactivated.') && Number(keyType) === 1) {
        await this.modelsService.lockKey(keyId, '当前模型key已被封禁、已冻结当前调用Key、尝试重新对话试试吧！', -1)
        message = '当前模型key已被封禁'
      }

      if (error?.statusCode === 429 && error.message.includes('You exceeded your current quota, please check your plan and billing details.') && Number(keyType) === 1) {
        await this.modelsService.lockKey(keyId, '当前模型key余额已耗尽、已冻结当前调用Key、尝试重新对话试试吧！', -3)
        message = '当前模型key余额已耗尽'
      }

      /* 提供了错误的秘钥 */
      if (error?.statusCode === 401 && error.message.includes('Incorrect API key provided') && Number(keyType) === 1) {
        await this.modelsService.lockKey(keyId, '提供了错误的模型秘钥', -2)
        message = '提供了错误的模型秘钥、已冻结当前调用Key、请重新尝试对话！'
      }

      /* 模型有问题 */
      if (error?.statusCode === 404 && error.message.includes('This is not a chat model and thus not supported') && Number(keyType) === 1) {
        await this.modelsService.lockKey(keyId, '当前模型不是聊天模型', -4)
        message = '当前模型不是聊天模型、已冻结当前调用Key、请重新尝试对话！'
      }

      if (code === 400) {
        console.log('400 error', error, error.message);
      }

      /* 防止因为key的原因直接导致客户端以为token过期退出  401只给用于鉴权token中 */
      const errMsg = { message: message || 'Please check the back-end console', code: code === 401 ? 400 : code || 500 };

      if (res) {
        return res.write(JSON.stringify(errMsg));
      } else {
        throw new HttpException(errMsg.message, HttpStatus.BAD_REQUEST);
      }
    } finally {
      res && res.end();
    }
  }

  async draw(body: ChatDrawDto, req: Request) {
    /* 敏感词检测 */
    await this.badwordsService.checkBadWords(body.prompt, req.user.id);
    Logger.log(`draw paompt info <======*******======> ${body.prompt}`, 'DrawService');
    await this.userService.checkUserStatus(req.user);
    await this.userBalanceService.validateBalance(req, DeductionKey.PAINT_TYPE, body.n || 1);
    let images = [];
    /* 从3的卡池随机拿一个key */
    const detailKeyInfo = await this.modelsService.getRandomDrawKey()
    const { key, proxyResUrl } = await this.formatModelToken(detailKeyInfo);
    const api = `${proxyResUrl}/v1/images/generations`;
    try {
      const res = await axios.post(api, { ...body, response_format: 'b64_json' }, { headers: { Authorization: `Bearer ${key}` } });
      images = res.data.data;
    } catch (error) {
      console.log('openai-draw', error);
      const status = error?.response?.status || 500;
      const message = error?.response?.data?.error?.message;
      if (status === 429) {
        throw new HttpException('当前请求已过载、请稍等会儿再试试吧！', HttpStatus.BAD_REQUEST);
      }
      if (status === 400 || message.includes('Your request was rejected as a result of our safety system')) {
        throw new HttpException('您的请求已被系统拒绝。您的提示可能存在一些非法的文本。', HttpStatus.BAD_REQUEST);
      }
      if (status === 500) {
        throw new HttpException('绘制图片失败，请检查你的提示词是否有非法描述！', HttpStatus.BAD_REQUEST);
      }
      if (status === 401) {
        throw new HttpException('绘制图片失败，此次绘画被拒绝了！', HttpStatus.BAD_REQUEST);
      }
      throw new HttpException('绘制图片失败，请稍后试试吧！', HttpStatus.BAD_REQUEST);
    }
    const task = [];
    for (const item of images) {
      const filename = uuid.v4().slice(0, 10) + '.png';
      const buffer = Buffer.from(item.b64_json, 'base64');
      task.push(this.uploadService.uploadFile({ filename, buffer }));
    }
    const urls = await Promise.all(task);
    /* 绘制openai的dall-e2绘画也扣除的是对话次数 */
    await this.userBalanceService.deductFromBalance(req.user.id, 'model3', body.n, body.n || 1);
    const curIp = getClientIp(req);
    const taskLog = [];
    const cosType = await this.uploadService.getUploadType();
    const [width, height] = body.size.split('x');
    urls.forEach((url) => {
      taskLog.push(
        this.chatLogService.saveChatLog({
          curIp,
          userId: req.user.id,
          type: DeductionKey.PAINT_TYPE,
          prompt: body.prompt,
          answer: url,
          fileInfo: JSON.stringify({
            cosType,
            width,
            height,
            cosUrl: url,
          }),
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          model: 'DALL-E2',
        }),
      );
    });
    await Promise.all(taskLog);
    return urls;
  }

  /* 查询key的详情 */
  async getKeyDetail(key) {
    const defaultOpenaiBaseUrl: any = (await this.globalConfigService.getConfigs(['openaiBaseUrl'])) || 'https://api.openai.com';
    const API_BASE_URL = defaultOpenaiBaseUrl;
    try {
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
      const endDate = dayjs().format('YYYY-MM-DD');
      const startDate = dayjs().subtract(99, 'day').format('YYYY-MM-DD');
      const totolRes = await axios.get(`${API_BASE_URL}/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`, { headers });
      const total = totolRes?.data.total_usage ?? 0;
      const subscription: any = await axios.get(`${API_BASE_URL}/v1/dashboard/billing/subscription`, { headers });
      const { has_payment_method, hard_limit_usd, access_until } = subscription.data;
      const useAmount = (total / 100).toFixed(2);
      const totalAmount = Number(hard_limit_usd).toFixed(0);
      return {
        totalAmount: `${totalAmount}$`,
        useAmount: `${useAmount}$`,
        balance: `${(Number(totalAmount) - Number(useAmount)).toFixed(2)}$`,
        isBindCard: has_payment_method,
        expirDate: dayjs(access_until * 1000).format('YYYY年M月D日'),
        status: 1,
      };
    } catch (error) {
      return {
        status: -1,
      };
    }
  }

  async getModelAndKeyFromUser(userId, modelType) {
    let detailKeyInfo: any = {};
    if (modelType === 3) {
      detailKeyInfo = await this.getRandomGptKeyDetail(3);
    } else {
      detailKeyInfo = await this.getRandomGptKeyDetail(4);
    }
    const { model, key, id } = detailKeyInfo;
    /* 当前key的调用次数+1 */
    await this.gptKeysEntity
      .createQueryBuilder()
      .update(GptKeysEntity)
      .set({ useCount: () => 'useCount + 1' })
      .where('id = :id', { id })
      .execute();
    return detailKeyInfo;
  }

  /* 获取gpt模型 */
  async getGptModelList(key: string) {
    const defaultOpenaiBaseUrl: any = (await this.globalConfigService.getConfigs(['openaiBaseUrl'])) || 'https://api.openai.com';
    const url = defaultOpenaiBaseUrl + '/v1/models';
    try {
      const response = await axios.get(url, { headers: { Authorization: `Bearer ${key}` } });
      const list = response.data.data.map((t) => t.id);
      // return list;
      const whiteList = [
        'gpt-4',
        'gpt-4-0314',
        'gpt-4-0613',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-0301',
        'gpt-3.5-turbo-16k-0613',
        'gpt-3.5-turbo-16k',
        'code-davinci-002',
        'ada',
        'davinci',
      ];
      const allowModel = whiteList.filter((t) => list.includes(t));
      return allowModel;
    } catch (error) {
      throw new HttpException('获取模型列表失败，请检查你的key是否正确！', HttpStatus.BAD_REQUEST);
    }
  }

  /* 查询key列表信息 */
  async getKeyList(prams: GetKeyListDto, req: Request) {
    try {
      const where = {};
      const { page = 1, size = 10, key, status, keyStatus, model } = prams;
      key && (where['key'] = Like(`%${key}%`));
      keyStatus && (where['keyStatus'] = keyStatus);
      model && (where['model'] = model);
      [0, 1, '0', '1', '-1', -1].includes(status) && (where['status'] = status);
      const [rows, count] = await this.gptKeysEntity.findAndCount({
        skip: (page - 1) * size,
        take: size,
        where,
        order: { id: 'DESC' },
      });
      const taskDetail = [];
      rows.forEach((t) => taskDetail.push(this.getKeyDetail(t.key)));
      const keys = await Promise.all(taskDetail);
      rows.forEach((t, i) => (t['keyDetail'] = keys[i]));
      req.user.role !== 'super' &&
        rows.forEach((t) => {
          t.key = t.key ? hideString(t.key) : '';
          t.openaiProxyUrl = t.openaiProxyUrl ? hideString(t.openaiProxyUrl) : '';
        });
      return { rows, count };
    } catch (error) {
      console.log('error: ', error);
      throw new HttpException('查询key列表失败', HttpStatus.BAD_REQUEST);
    }
  }

  async addKey(body: AddKeyDto) {
    const { key } = body;
    const k = await this.gptKeysEntity.findOne({ where: { key } });
    if (k) {
      throw new HttpException('key已存在', HttpStatus.BAD_REQUEST);
    }
    const res = await this.gptKeysEntity.save(body);
    await this.getAllKeyList();
    return res;
  }

  /* 批量添加Key */
  async bulkCreateKey(body: BulkCreateKeyDto) {
    const { keyList } = body;
    const repeatKeys = await this.gptKeysEntity.find({ where: { key: In(keyList) } });
    const repeatKeyList = repeatKeys.map((t) => t.key);
    const newKeyList = keyList.filter((t) => !repeatKeyList.includes(t));
    const data = newKeyList.map((key) => {
      return { key, status: 1, model: 'gpt-3.5-turbo-16k-0613' };
    });
    /* 批量插入key */
    const insertRes = await this.gptKeysEntity.save(data);
    let msg = `本次成功添加${data.length}个key`;
    repeatKeyList.length && (msg += `、重复key${repeatKeyList.length}个已被排除！`);
    return msg;
  }

  /* 修改key */
  async updateKey(body: UpdateKeyDto) {
    const { id } = body;
    const k = await this.gptKeysEntity.findOne({ where: { id } });
    if (!k) {
      throw new HttpException('key不存在', HttpStatus.BAD_REQUEST);
    }
    const res = await this.gptKeysEntity.update({ id }, body);
    if (res.affected > 0) {
      await this.getAllKeyList();
      return '修改成功';
    } else {
      throw new HttpException('修改失败', HttpStatus.BAD_REQUEST);
    }
  }

  /* 删除key */
  async deleteKey(body: DeleteKeyDto) {
    const { id } = body;
    const k = await this.gptKeysEntity.findOne({ where: { id } });
    if (!k) {
      throw new HttpException('key不存在', HttpStatus.BAD_REQUEST);
    }
    const res = await this.gptKeysEntity.delete({ id });
    if (res.affected > 0) {
      await this.getAllKeyList();
      return '删除成功';
    } else {
      throw new HttpException('删除失败', HttpStatus.BAD_REQUEST);
    }
  }

  /* 当前所有key的列表 */
  async getAllKeyList() {
    const list = await this.gptKeysEntity.find({
      where: { status: 1 },
      select: ['id', 'key', 'weight', 'model', 'maxModelTokens', 'maxResponseTokens', 'openaiProxyUrl', 'openaiTimeoutMs'],
    });
    const list3 = list.filter((t) => t.model.includes('gpt-3'));
    const list4 = list.filter((t) => t.model.includes('gpt-4'));
    this.keyPool = {
      list3,
      list4,
    };
  }

  // TODO：废弃
  async getUserWhiteList() {
    // count需要大于0
    const data = await this.whiteListEntity.find({ where: { status: 1, count: MoreThan(0) }, select: ['userId'] });
    this.whiteListUser = data.map((t) => t.userId);
  }

  /* 添加白名单用户 */
  async addWhiteUser(body: AddWhiteUserDto) {
    const { userId, count } = body;
    const u = await this.whiteListEntity.findOne({ where: { userId } });
    if (u) {
      throw new HttpException('用户已在白名单中！', HttpStatus.BAD_REQUEST);
    }
    const res = await this.whiteListEntity.save(body);
    await this.getUserWhiteList();
    return res;
  }

  // TODO：废弃
  /* 修改白名单信息 */
  async updateWhiteUser(body: UpdateWhiteUserDto) {
    const { id } = body;
    const u = await this.whiteListEntity.findOne({ where: { id } });
    if (!u) {
      throw new HttpException('当前记录不存在！', HttpStatus.BAD_REQUEST);
    }
    const res = await this.whiteListEntity.update({ id }, body);
    if (res.affected > 0) {
      await this.getUserWhiteList();
      return '修改白名单成功';
    } else {
      throw new HttpException('修改白名单失败', HttpStatus.BAD_REQUEST);
    }
  }

  // TODO：废弃
  /* 查询白名单用户 */
  async getWhiteListUser(query, req) {
    const { page = 1, size = 10 } = query;
    const [rows, count] = await this.whiteListEntity.findAndCount({
      skip: (page - 1) * size,
      take: size,
      order: { id: 'DESC' },
    });
    const userIds = rows.map((t) => t.userId);
    const userInfos = await this.userEntity.find({ where: { id: In(userIds) } });
    rows.forEach((t) => {
      const user = userInfos.find((u) => u.id === t.userId);
      t['username'] = user?.username ?? '';
      t['email'] = user?.email ?? '';
    });
    req.user.role !== 'super' && rows.forEach((t: any) => (t.email = maskEmail(t.email)));
    return { rows, count };
  }


  /* 拿到代理地址 */
  async getModelProxyUrl(modelKey) {
    const { proxyUrl } = modelKey
    const openaiBaseUrl = await this.globalConfigService.getConfigs(['openaiBaseUrl']);
    return proxyUrl || openaiBaseUrl || 'https://api.openai.com';
  }


  /* TODO 区分整理不同默认的token数量管理 */
  async formatModelToken(detailKeyInfo) {
    /* global config */
    const {
      openaiModel3MaxTokens = 0,
      openaiModel3MaxTokensRes = 0,
      openaiModel3MaxTokens16k = 0,
      openaiModel3MaxTokens16kRes = 0,
      openaiModel4MaxTokens = 0,
      openaiModel4MaxTokensRes = 0,
      openaiModel4MaxTokens32k = 0,
      openaiModel4MaxTokens32kRes = 0,
      openaiBaseUrl = '',
    } = await this.globalConfigService.getConfigs([
      'openaiModel3MaxTokens',
      'openaiModel3MaxTokensRes',
      'openaiModel3MaxTokens16k',
      'openaiModel3MaxTokens16kRes',
      'openaiModel4MaxTokens',
      'openaiModel4MaxTokensRes',
      'openaiModel4MaxTokens32k',
      'openaiModel4MaxTokens32kRes',
      'openaiBaseUrl',
    ]);

    let maxToken = null;
    let maxTokenRes = null;
    let proxyResUrl = null;
    let  { model, maxModelTokens = 0, maxResponseTokens = 0, proxyUrl = '', key } = detailKeyInfo;

    if (model.toLowerCase().includes('gpt-4')) {
      if (model.toLowerCase().includes('32k')) {
        maxModelTokens >= 32768 && ( maxModelTokens = 32768)
        maxTokenRes >= 16384 && ( maxModelTokens = 16384)
        maxToken = maxModelTokens || openaiModel4MaxTokens32k || 32768;
        maxTokenRes = maxResponseTokens || openaiModel4MaxTokens32kRes || 16384;
      } else {
        maxModelTokens >= 8192 && ( maxModelTokens = 8192)
        maxTokenRes >= 4096 && ( maxModelTokens = 4096)
        maxToken = maxModelTokens || openaiModel4MaxTokens || 8192;
        maxTokenRes = maxResponseTokens || openaiModel4MaxTokensRes || 4096;
      }
    }
    if (model.toLowerCase().includes('gpt-3')) {
      if (model.toLowerCase().includes('16k')) {
        maxModelTokens >= 16384 && ( maxModelTokens = 16384)
        maxTokenRes >= 8192 && ( maxModelTokens = 8192)
        maxToken = maxModelTokens || openaiModel3MaxTokens16k || 16384;
        maxTokenRes = maxResponseTokens || openaiModel3MaxTokens16kRes || 8192;
      } else {
        maxModelTokens >= 4096 && ( maxModelTokens = 4096)
        maxTokenRes >= 2000 && ( maxModelTokens = 2000)
        maxToken = maxModelTokens || openaiModel3MaxTokens || 4096;
        maxTokenRes = maxResponseTokens || openaiModel3MaxTokensRes || 2000;
      }
    }

    proxyResUrl = proxyUrl || openaiBaseUrl || 'https://api.openai.com';
    if (maxTokenRes >= maxToken) {
      maxTokenRes = Math.floor(maxToken / 2);
      Logger.debug(`key: ${key} 回复数不得大于等于模型上下文数, 已自动调整为 maxTokenRes: ${maxTokenRes}`);
    }
    return {
      key,
      maxToken,
      maxTokenRes,
      proxyResUrl,
    };
  }
}
