import { JwtAuthGuard } from './../../common/auth/jwtAuth.guard';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatgptService } from './chatgpt.service';
import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ChatProcessDto } from './dto/chatProcess.dto';
import { Request, Response } from 'express';
import { ChatDrawDto } from './dto/chatDraw.dto';
import { AddKeyDto } from './dto/addKey.dto';
import { GetKeyListDto } from './dto/getKeyList.dto';
import { UpdateKeyDto } from './dto/updateKey.dto';
import { AddWhiteUserDto } from './dto/addWhiteUser.dto';
import { GetWhiteUserListDto } from './dto/getWhiteUserList.dto';
import { UpdateWhiteUserDto } from './dto/updateWhiteUser.dto';
import { AdminAuthGuard } from '@/common/auth/adminAuth.guard';
import { SuperAuthGuard } from '@/common/auth/superAuth.guard';
import { DeleteKeyDto } from './dto/deleteKey.dto';
import { BulkCreateKeyDto } from './dto/bulkCreateKey.dto';
import { GlobalConfigService } from '../globalConfig/globalConfig.service';

@ApiTags('chatgpt')
@Controller('chatgpt')
export class ChatgptController {
  constructor(private readonly chatgptService: ChatgptService, private readonly globalConfigService: GlobalConfigService) {}

  @Post('chat-process')
  @ApiOperation({ summary: 'gpt聊天对话' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  chatProcess(@Body() body: ChatProcessDto, @Req() req: Request, @Res() res: Response) {
    return this.chatgptService.chatProcess(body, req, res);
  }

  @Post('chat-sync')
  @ApiOperation({ summary: 'gpt聊天对话' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  chatProcessSync(@Body() body: ChatProcessDto, @Req() req: Request) {
    return this.chatgptService.chatProcess({ ...body }, req);
  }

  @Post('mj-associate')
  @ApiOperation({ summary: 'gpt描述词绘画联想' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async mjAssociate(@Body() body: ChatProcessDto, @Req() req: Request) {
    const mjCustomLianxiangPrompt = await this.globalConfigService.getConfigs(['mjCustomLianxiangPrompt']);
    /* 临时方案 指定其系统预设词 */
    body.systemMessage =
      mjCustomLianxiangPrompt ||
      `midjourney是一款AI绘画工具，只要你输入你想到的文字，就能通过人工智能产出相对应的图片、我希望你作为MidJourney程序的提示词(prompt)生成器。你的工作是根据我给你的一段提示内容扩展为更详细和更有创意的描述，以激发人工智能的独特和有趣的图像。请记住，人工智能能够理解广泛的语言，并能解释抽象的概念，所以请自由发挥想象力和描述力，尽可能地发挥。例如，你可以描述一个未来城市的场景，或一个充满奇怪生物的超现实景观。你的描述越详细、越有想象力，产生的图像就越有趣、Midjourney prompt的标准公式为:(image we're prompting).(5 descriptivekeywords). (camera type). (camera lens type). (time of day)(style of photograph).(type offilm)、请记住这个公式，后续统一使用该公式进行prompt生成、最终把我给你的提示变成一整段连续不分开的完整内容，并且只需要用英文回复您的联想、一定不要回复别内容、包括解释、我只需要纯粹的内容。`;
    return this.chatgptService.chatProcess({ ...body, cusromPrompt: true }, req);
  }

  @Post('mj-fy')
  @ApiOperation({ summary: 'gpt描述词绘画翻译' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async mjFanyi(@Body() body: ChatProcessDto, @Req() req: Request) {
    /* 临时方案 指定其系统预设词 */
    const mjCustomFanyiPrompt = await this.globalConfigService.getConfigs(['mjCustomFanyiPrompt']);
    body.systemMessage =
      mjCustomFanyiPrompt ||
      `接下来我会给你一些内容、我希望你帮我翻译成英文、不管我给你任何语言、你都回复我英文、如果给你了英文、依然回复我更加优化的英文、并且期望你不需要做任何多余的解释、给我英文即可、不要加任何东西、我只需要英文！`;
    return this.chatgptService.chatProcess({ ...body, cusromPrompt: true }, req);
  }

  @Post('chat-mind')
  @ApiOperation({ summary: 'mind思维导图提示' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async chatmind(@Body() body: ChatProcessDto, @Req() req: Request, @Res() res: Response) {
    const mindCustomPrompt = await this.globalConfigService.getConfigs(['mindCustomPrompt']);
    /* 临时方案 指定其系统预设词 */
    body.systemMessage =
      mindCustomPrompt ||
      `我希望你使用markdown格式回答我得问题、我的需求是得到一份markdown格式的大纲、尽量做的精细、层级多一点、不管我问你什么、都需要您回复我一个大纲出来、我想使用大纲做思维导图、除了大纲之外、不要无关内容和总结。`;
    return this.chatgptService.chatProcess({ ...body, cusromPrompt: true }, req, res);
  }

  @Post('chat-draw')
  @ApiOperation({ summary: 'gpt绘画' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async draw(@Body() body: ChatDrawDto, @Req() req: Request) {
    // const mjCustomFanyiPrompt = await this.globalConfigService.getConfigs(['mjCustomFanyiPrompt']);
    // const systemMessage =
    //   mjCustomFanyiPrompt ||
    //   `你只可以回复英文、你是一个中译英翻译官、接下来我会给你一些内容、我希望你帮我翻译成英文、不管我给你任何语言、你都回复我英文、如果给你了英文、请不要做任何改变原样回复给我、并且期望你不需要做任何多余的解释、给我英文即可、不要加任何东西、我只需要英文！`;
    // const text = await this.chatgptService.chatProcess({ ...body, systemMessage, cusromPrompt: true }, req);
    // console.log('text: ', text);
    // if (text) {
    //   body.prompt = text;
    // }
    return await this.chatgptService.draw(body, req);
  }

  @Get('keyDetail')
  @ApiOperation({ summary: 'gpt key详情' })
  async getKeyDetail(@Query('key') key: string) {
    return await this.chatgptService.getKeyDetail(key);
  }

  @Get('keyList')
  @ApiOperation({ summary: '查询key的列表' })
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  async getKeyList(@Query() params: GetKeyListDto, @Req() req: Request) {
    return await this.chatgptService.getKeyList(params, req);
  }

  @Get('keyModelList')
  @ApiOperation({ summary: '获取key支持的model列表' })
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  async getGptModelList(@Query('key') key: string) {
    return await this.chatgptService.getGptModelList(key);
  }

  @Post('addKey')
  @ApiOperation({ summary: '添加key' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async addKey(@Body() body: AddKeyDto) {
    return await this.chatgptService.addKey(body);
  }

  @Post('updateKey')
  @ApiOperation({ summary: '修改key' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async updateKey(@Body() body: UpdateKeyDto) {
    return await this.chatgptService.updateKey(body);
  }

  @Post('deleteKey')
  @ApiOperation({ summary: '删除key' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async deleteKey(@Body() body: DeleteKeyDto) {
    return await this.chatgptService.deleteKey(body);
  }

  @Post('addWhiteUser')
  @ApiOperation({ summary: '添加白名单用户' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async addWhiteUser(@Body() body: AddWhiteUserDto) {
    return this.chatgptService.addWhiteUser(body);
  }

  @Post('updateWhiteUser')
  @ApiOperation({ summary: '修改白名单用户' })
  @UseGuards(SuperAuthGuard)
  @ApiBearerAuth()
  async updateWhiteUser(@Body() body: UpdateWhiteUserDto) {
    return this.chatgptService.updateWhiteUser(body);
  }

  @Get('userWhiteList')
  @ApiOperation({ summary: '查询白名单用户' })
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  async getWhiteListUser(@Query() query: GetWhiteUserListDto, @Req() req: Request) {
    return this.chatgptService.getWhiteListUser(query, req);
  }
}
