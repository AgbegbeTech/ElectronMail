import {splitEvery} from "ramda";

import * as Model from "./model";
import * as Util from "src/electron-preload/webview/tutanota/lib/util";
import {BaseEntity, Id, IdTuple, RequestParams, TypeRef} from "./model";
import {Omit} from "src/shared/types";
import {WEBVIEW_LOGGERS} from "src/electron-preload/webview/constants";
import {curryFunctionMembers} from "src/shared/util";
import {resolveProviderApi} from "src/electron-preload/webview/tutanota/lib/provider-api";

const logger = curryFunctionMembers(WEBVIEW_LOGGERS.tutanota, "[lib/rest");

export async function fetchEntity<T extends BaseEntity<Id | IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    id: T["_id"],
): Promise<T> {
    logger.verbose("fetchEntity()");

    const {load} = (await resolveProviderApi())["src/api/main/Entity"];

    return load(typeRef, id);
}

export async function fetchAllEntities<T extends BaseEntity<IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: T["_id"][0],
): Promise<T[]> {
    logger.verbose("fetchAllEntities()");

    const {loadAll} = (await resolveProviderApi())["src/api/main/Entity"];

    return loadAll(typeRef, listId);
}

export async function fetchMultipleEntities<T extends BaseEntity<Id | IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: T["_id"] extends IdTuple ? T["_id"][0] : null,
    instanceIds: Array<T["_id"] extends IdTuple ? T["_id"][1] : T["_id"]>,
    chunkSize = 100,
): Promise<T[]> {
    logger.verbose("fetchMultipleEntities()");

    const {loadMultiple} = (await resolveProviderApi())["src/api/main/Entity"];
    const instanceIdsChunks = splitEvery(chunkSize, instanceIds);
    const result: T[] = [];

    for (const instanceIdsChunk of instanceIdsChunks) {
        result.push(...await loadMultiple(typeRef, listId, instanceIdsChunk));
    }

    return result;
}

export async function fetchEntitiesRange<T extends BaseEntity<IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: T["_id"][0],
    queryParams: Required<Omit<RequestParams, "ids">>,
): Promise<T[]> {
    logger.verbose("fetchEntitiesRange()");

    const {loadRange} = (await resolveProviderApi())["src/api/main/Entity"];

    return loadRange(typeRef, listId, queryParams.start, queryParams.count, queryParams.reverse);
}

export async function fetchEntitiesRangeUntilTheEnd<T extends BaseEntity<IdTuple>, TypeRefType extends TypeRef<T>>(
    typeRef: TypeRef<T>,
    listId: T["_id"][0],
    {start, count}: Required<Omit<RequestParams, "ids" | "reverse">>,
): Promise<T[]> {
    logger.verbose("fetchEntitiesRangeUntilTheEnd()");

    count = Math.max(1, Math.min(count, 500));

    const {timestampToGeneratedId, generatedIdToTimestamp} = (await resolveProviderApi())["src/api/common/utils/Encoding"];
    const entities = await fetchEntitiesRange(typeRef, listId, {start, count, reverse: false});
    const fullPortionFetched = entities.length === count;

    if (fullPortionFetched) {
        const lastEntity = entities[entities.length - 1];
        const currentPortionEndId = Util.resolveInstanceId(lastEntity);
        const currentPortionEndTimestamp = generatedIdToTimestamp(currentPortionEndId);
        const nextPortionStartId = timestampToGeneratedId(currentPortionEndTimestamp + 1);

        entities.push(
            ...await fetchEntitiesRangeUntilTheEnd(typeRef, listId, {start: nextPortionStartId, count}),
        );
    }

    return entities;
}

export {
    Model,
    Util,
};
