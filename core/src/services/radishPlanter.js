/**
 * 白萝卜种植服务 - 管理白萝卜种植计数和状态持久化
 * 白萝卜种子ID: 20002
 */

const { readJsonFile, writeJsonFileAtomic } = require('./json-db');
const { getDataFile, ensureDataDir } = require('../config/runtime-paths');
const { log, logWarn, toNum } = require('../utils/utils');
const { getPlantNameBySeedId } = require('../config/gameConfig');
// 注意：farm.js 的函数使用延迟导入以避免循环依赖

// 白萝卜种子ID
const RADISH_SEED_ID = 20002;
const RADISH_PLANT_ID = 2; // 对应的植物ID
const RADISH_TARGET_COUNT = 500; // 目标种植数量
const SEED_SHOP_ID = 2;

// 状态文件路径
const RADISH_STATE_FILE = getDataFile('radish_state.json');

/**
 * 白萝卜状态管理
 */
class RadishPlanter {
    constructor() {
        this.state = {
                plantedCount: 0, // 已种植数量
                lastPlantTime: 0, // 最后种植时间
                resetRequested: false, // 是否请求重置
            };
        this.loadState();
    }

    /**
     * 加载状态（重启后恢复）
     */
    loadState() {
        try {
            const data = readJsonFile(RADISH_STATE_FILE, () => null);
            if (data && typeof data === 'object') {
                this.state = {
                    plantedCount: Math.max(0, Number(data.plantedCount) || 0),
                    lastPlantTime: Number(data.lastPlantTime) || 0,
                    resetRequested: !!data.resetRequested,
                };
                log('白萝卜', `加载状态: 已种植 ${this.state.plantedCount}/${RADISH_TARGET_COUNT}`);
            }
        } catch (e) {
            logWarn('白萝卜', `加载状态失败: ${e.message}`);
        }
    }

    /**
     * 保存状态
     */
    saveState() {
        ensureDataDir();
        try {
            writeJsonFileAtomic(RADISH_STATE_FILE, this.state);
        } catch (e) {
            logWarn('白萝卜', `保存状态失败: ${e.message}`);
        }
    }

    /**
     * 获取当前状态
     */
    getState() {
        return {
            ...this.state,
            targetCount: RADISH_TARGET_COUNT,
            remaining: Math.max(0, RADISH_TARGET_COUNT - this.state.plantedCount),
            completed: this.state.plantedCount >= RADISH_TARGET_COUNT,
        };
    }

    /**
     * 获取剩余需要种植的数量
     * @returns {number}
     */
    getRemainingCount() {
        return Math.max(0, RADISH_TARGET_COUNT - this.state.plantedCount);
    }

    /**
     * 是否需要种植白萝卜
     * @returns {boolean}
     */
    shouldPlantRadish() {
        // 检查是否已达到目标
        if (this.state.plantedCount >= RADISH_TARGET_COUNT) {
            return false;
        }
        // 检查是否被重置
        if (this.state.resetRequested) {
            return false;
        }
        return true;
    }

    /**
     * 记录种植白萝卜
     * @param {number} count 种植数量
     */
    recordPlant(count = 1) {
        const actualCount = Math.max(1, Number(count) || 1);
        this.state.plantedCount += actualCount;
        this.state.lastPlantTime = Date.now();
        this.saveState();
        log('白萝卜', `种植 ${actualCount} 个，总计 ${this.state.plantedCount}/${RADISH_TARGET_COUNT}`, {
            module: 'radish',
            event: 'plant',
            count: actualCount,
            total: this.state.plantedCount,
        });
    }

    /**
     * 请求重置计数器
     */
    requestReset() {
        this.state.resetRequested = true;
        this.saveState();
        log('白萝卜', '已请求重置计数器，下次种植时将重新开始', {
            module: 'radish',
            event: 'reset_requested',
        });
    }

    /**
     * 执行重置
     */
    performReset() {
        this.state.plantedCount = 0;
        this.state.lastPlantTime = 0;
        this.state.resetRequested = false;
        this.saveState();
        log('白萝卜', '计数器已重置为 0', {
            module: 'radish',
            event: 'reset_done',
        });
    }

}

// 单例实例
let radishPlanterInstance = null;

function getRadishPlanter() {
    if (!radishPlanterInstance) {
        radishPlanterInstance = new RadishPlanter();
    }
    return radishPlanterInstance;
}

/**
 * 种植白萝卜种子
 * @param {number[]} landsToPlant - 可种植的地块ID列表
 * @param {number} needCount - 需要种植的数量
 * @param {object} state - 用户状态（包含金币等）
 * @returns {Promise<number>} 实际种植数量
 */
async function plantRadishSeeds(landsToPlant, needCount, state) {
    // 延迟导入避免循环依赖
    const { getShopInfo, buyGoods, plantSeeds, runFertilizerByConfig, recordOperation } = require('./farm');
    
    const seedId = RADISH_SEED_ID;
    const seedName = getPlantNameBySeedId(seedId);
    
    // 先查询商店获取白萝卜种子商品信息
    let goodsId = null;
    let price = 0;
    try {
        const shopReply = await getShopInfo(SEED_SHOP_ID);
        if (shopReply.goods_list) {
            for (const goods of shopReply.goods_list) {
                if (toNum(goods.item_id) === seedId) {
                    goodsId = toNum(goods.id);
                    price = toNum(goods.price);
                    break;
                }
            }
        }
    } catch (e) {
        logWarn('白萝卜', `查询商店失败: ${e.message}`);
        return 0;
    }

    if (!goodsId) {
        logWarn('白萝卜', `未在商店找到白萝卜种子 (seedId: ${seedId})`);
        return 0;
    }

    // 检查金币是否足够
    const totalCost = price * needCount;
    if (totalCost > state.gold) {
        const canBuy = Math.floor(state.gold / price);
        if (canBuy <= 0) {
            logWarn('白萝卜', `金币不足! 需要 ${totalCost} 金币, 当前 ${state.gold} 金币`);
            return 0;
        }
        needCount = canBuy;
        log('白萝卜', `金币有限，只种 ${needCount} 块白萝卜`);
    }

    // 购买种子
    try {
        const buyReply = await buyGoods(goodsId, needCount, price);
        if (buyReply.cost_items) {
            for (const item of buyReply.cost_items) {
                state.gold -= toNum(item.count);
            }
        }
        log('购买', `已购买 ${seedName}种子 x${needCount}, 花费 ${price * needCount} 金币`, {
            module: 'farm',
            event: 'radish_seed_buy',
            result: 'ok',
            seedId,
            count: needCount,
            cost: price * needCount,
        });
    } catch (e) {
        logWarn('购买', `购买白萝卜种子失败: ${e.message}`);
        return 0;
    }

    // 种植
    let plantedLands = [];
    try {
        const { planted, plantedLandIds } = await plantSeeds(seedId, landsToPlant, { maxPlantCount: needCount });
        log('种植', `已种植白萝卜 ${planted} 块地`, {
            module: 'farm',
            event: 'radish_plant',
            result: 'ok',
            seedId,
            count: planted,
        });
        if (planted > 0) {
            plantedLands = plantedLandIds;
            recordOperation('plant', planted);
        }
        // 施肥
        await runFertilizerByConfig(plantedLands);
        return planted;
    } catch (e) {
        logWarn('种植', `白萝卜种植失败: ${e.message}`);
        return 0;
    }
}

module.exports = {
    RADISH_SEED_ID,
    RADISH_PLANT_ID,
    RADISH_TARGET_COUNT,
    getRadishPlanter,
    plantRadishSeeds,
};